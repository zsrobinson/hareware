import { parseHTML } from "linkedom";
import { ORIGIN, toArticleLink, toArticleSlug } from "./article-url";

/**
 * everything we need off a post, in one request. _links looks redundant next to
 * _embed but isn't — _embed builds itself out of the links, and asking for
 * fields without it silently returns no _embedded at all
 */
const FIELDS = [
  "title",
  "content",
  "date",
  "link",
  "jetpack_featured_media_url",
  "_links",
  "_embedded",
].join(",");

/** one quick retry for a momentary refusal, then the rendered page instead */
const RETRIES = 1;

/**
 * the longest we will wait before giving up on the api and reading the page
 *
 * this caps retry-after as well as our own backoff. the header is a request,
 * not an instruction, and honouring a large one would hold the whole function
 * open — ten articles at once on /email is exactly when a long one arrives, and
 * timing out serves nobody when a slower answer is sitting right there
 */
const MAX_RETRY_WAIT = 1500;

type Term = { name: string; taxonomy: string };

type Post = {
  title: { rendered: string };
  content: { rendered: string };
  date: string;
  link: string;
  jetpack_featured_media_url?: string;
  _embedded?: { "wp:term"?: Term[][] };
};

type Document = ReturnType<typeof parseHTML>["document"];

/** the api couldn't answer, so the rendered page is worth a try */
class Unavailable extends Error {}

/**
 * scrapes the article content from wordpress
 * @param article the full link, including schema and domain
 */
export async function scrapeArticle(article: string) {
  try {
    return fromPost(await fetchPost(toArticleSlug(article)));
  } catch (e) {
    if (!(e instanceof Unavailable)) throw e;

    // the api is throttled long before the rendered pages are, so the slow
    // route is still a better answer than no article
    return fromRenderedPage(toArticleLink(article) ?? article);
  }
}

/** the fields we need, off a rest api response */
function fromPost(post: Post) {
  // content.rendered is the markup that lands inside .entry-content on the
  // page, so wrapping it lets one set of selectors serve both sources
  const document = parseHTML(
    `<div class="entry-content">${post.content.rendered}</div>`,
  ).document;

  return {
    ...readEntryContent(document),
    title: post.title.rendered.trim(),
    image: post.jetpack_featured_media_url?.split("?")[0],
    date: formatDate(post.date),
    link: post.link,
    // wp:term comes back grouped by taxonomy, and category happens to lead
    // today — ask for it by name rather than trusting the order to hold
    section: post._embedded?.["wp:term"]
      ?.flat()
      .find((term) => term.taxonomy === "category")?.name,
  };
}

/**
 * the same fields read off the rendered article page
 *
 * this is the original approach, kept for when the api turns us away. it moves
 * 183 KB rather than 10 and eats a redirect on the way in, but wordpress.com
 * serves these out of batcache and throttles them far less aggressively
 */
async function fromRenderedPage(link: string) {
  const res = await fetch(link);
  if (!res.ok) throw new Error(`wordpress returned ${res.status} for ${link}`);

  const { document } = parseHTML(await res.text());

  return {
    ...readEntryContent(document),
    title:
      document.querySelector(".wp-block-post-title")?.innerHTML.trim() ?? "",
    image: document
      .querySelector(`meta[property="og:image"]`)
      ?.getAttribute("content")
      ?.split("?")[0],
    date: document
      .querySelector(".wp-block-post-date.has-text-align-right time")
      ?.innerHTML.trim(),
    link: res.url,
    section: document.querySelector(".taxonomy-category > a")?.innerHTML.trim(),
  };
}

/** the pieces that live inside .entry-content, whichever way we got there */
function readEntryContent(document: Document) {
  // linkedom splits text at entity boundaries (`a&nbsp;b` becomes three text
  // nodes), which makes getTaggedText emit redundant typeface tags
  document.querySelector(".entry-content")?.normalize();

  document
    .querySelector(".entry-content")
    ?.querySelectorAll("*")
    .forEach((el) => {
      // remove all empty elements inside of the posts
      if (el.innerHTML.trim() === "" && el.tagName !== "BR") {
        el.remove();
      }
    });

  const author = document
    .querySelector(".entry-content p:first-of-type")
    ?.textContent?.trim()
    .split(": ")[1];

  const imageCredits = document
    .querySelector(".entry-content p:last-of-type em")
    ?.innerHTML.trim()
    .split(": ")[1];

  const content = [
    ...document.querySelectorAll(
      ".entry-content p, .entry-content h2, .entry-content h3, .entry-content ol, .entry-content ul",
    ),
  ].filter((el) => el.innerHTML !== "");

  return { author, imageCredits, content };
}

/**
 * the one post matching a slug
 *
 * this reads the rest api rather than the rendered page: the page is 183 KB of
 * theme chrome around the same content the api returns in about 10 KB, and a
 * bare slug permalink 301s to its dated form on the way in, which the api skips
 */
async function fetchPost(slug: string): Promise<Post> {
  const params = new URLSearchParams({
    slug,
    _embed: "wp:term",
    _fields: FIELDS,
  });
  const url = `${ORIGIN}/wp-json/wp/v2/posts?${params}`;

  for (let attempt = 0; ; attempt++) {
    let res: Response;

    try {
      res = await fetch(url);
    } catch (e) {
      // a refused connection or dns wobble is no less worth falling back on
      // than a refusal we can read a status off
      throw new Unavailable(`${slug}: ${e}`);
    }

    // 429 is what wordpress.com throttles with, but a 5xx is the same story
    // from our side: the api can't answer and the rendered page still might
    if (res.status === 429 || res.status >= 500) {
      const wait = retryDelay(res.headers.get("retry-after"), attempt);
      if (attempt >= RETRIES || wait > MAX_RETRY_WAIT)
        throw new Unavailable(`${slug} (${res.status})`);

      await sleep(wait);
      continue;
    }

    if (!res.ok) throw new Error(`wordpress returned ${res.status} for ${slug}`);

    const [post] = (await res.json()) as Post[];
    if (!post) throw new Error(`no published article matches ${slug}`);

    return post;
  }
}

/** honour retry-after when we get one, otherwise back off with jitter so a
 * batch of parallel requests doesn't retry in lockstep */
function retryDelay(retryAfter: string | null, attempt: number): number {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return 2 ** attempt * 400 + Math.random() * 400;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * wordpress dates carry no offset and are already in the site's timezone, so
 * they get pinned to utc rather than reinterpreted against wherever this runs
 */
function formatDate(date: string): string {
  return new Date(`${date}Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

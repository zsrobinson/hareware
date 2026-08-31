import { parseHTML } from "linkedom";
import { ORIGIN, toArticleSlug } from "./article-url";

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

type Post = {
  title: { rendered: string };
  content: { rendered: string };
  date: string;
  link: string;
  jetpack_featured_media_url?: string;
  _embedded?: { "wp:term"?: { name: string }[][] };
};

/**
 * scrapes the article content from wordpress
 * @param article the full link, including schema and domain
 */
export async function scrapeArticle(article: string) {
  const post = await fetchPost(toArticleSlug(article));

  // the rest api hands back the same markup that lands inside .entry-content on
  // the rendered page, so wrapping it lets the selectors below stay as they were
  const { document } = parseHTML(
    `<div class="entry-content">${post.content.rendered}</div>`,
  );

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

  return {
    title: post.title.rendered.trim(),
    author,
    imageCredits,
    image: post.jetpack_featured_media_url?.split("?")[0] ?? "",
    date: formatDate(post.date),
    content,
    link: post.link,
    section: post._embedded?.["wp:term"]?.[0]?.[0]?.name,
  };
}

const RETRIES = 3;

/**
 * the one post matching a slug
 *
 * this reads the rest api rather than the rendered page: the page is 183 KB of
 * theme chrome around the same content the api returns in about 10 KB, and a
 * bare slug permalink 301s to its dated form on the way in, which the api skips
 *
 * wordpress.com rate limits the api per client more tightly than it does the
 * rendered pages, and a burst of cache misses will come back 429 — /email asks
 * for ten articles at once — so a refused request is worth retrying
 */
async function fetchPost(slug: string): Promise<Post> {
  const params = new URLSearchParams({
    slug,
    _embed: "wp:term",
    _fields: FIELDS,
  });
  const url = `${ORIGIN}/wp-json/wp/v2/posts?${params}`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);

    if (res.status === 429 && attempt < RETRIES) {
      await sleep(retryDelay(res.headers.get("retry-after"), attempt));
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

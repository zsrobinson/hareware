import { parseHTML } from "linkedom";
import { scrub, scrubFragment } from "./scrub-html";
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

/** a post as the wordpress rest api returns it */
type WordPressPost = {
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
 * @param link the full link, including schema and domain
 */
export async function scrapeArticle(link: string) {
  try {
    return fromPost(await fetchPost(toArticleSlug(link)));
  } catch (e) {
    if (!(e instanceof Unavailable)) throw e;

    /*
      the api is throttled long before the rendered pages are, so the slow
      route is still a better answer than no article.

      no `?? link` fallback: that fetched the caller's string unvalidated in
      exactly the case where it is not one of ours, which made the host
      allow-list in article-url.ts optional. every path into fetch goes
      through it
    */
    const url = toArticleLink(link);
    if (!url) {
      throw new Error(`not an article on this site: ${link}`, { cause: e });
    }

    return fromRenderedPage(url);
  }
}

/** the fields we need, off a rest api response */
function fromPost(post: WordPressPost) {
  // content.rendered is the markup that lands inside .entry-content on the
  // page, so wrapping it lets one set of selectors serve both sources
  /* wordpress decides this markup, so it is scrubbed before anything reads it
     — see ~/lib/services/wordpress/scrub-html for what that is defending against */
  const document = scrub(
    parseHTML(`<div class="entry-content">${post.content.rendered}</div>`)
      .document,
  );

  return {
    ...readEntryContent(document),
    /* the title is rendered as html too, so it goes through the same scrub */
    title: scrubFragment(post.title.rendered),
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

  /*
    read before scrubbing. `scrub` drops <meta> outright — correctly, it is not
    content — and this reads a url out of one, so scrubbing first meant the
    featured image was silently always undefined on this path. the value is a
    url we hand to an <img src>, not markup we render, so taking it from the
    unscrubbed tree costs nothing
  */
  const image = document
    .querySelector(`meta[property="og:image"]`)
    ?.getAttribute("content")
    ?.split("?")[0];

  scrub(document);

  return {
    ...readEntryContent(document),
    title:
      document.querySelector(".wp-block-post-title")?.innerHTML.trim() ?? "",
    image,
    date: document
      .querySelector(".wp-block-post-date.has-text-align-right time")
      ?.innerHTML.trim(),
    link: res.url,
    section: document.querySelector(".taxonomy-category > a")?.innerHTML.trim(),
  };
}

/** wordpress labels the image credits this way whether or not it names anyone */
function hasCreditsLabel(el: Element): boolean {
  return (
    el.querySelector("em")?.textContent?.includes("Image Credits:") ?? false
  );
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

  const bylineEl = document.querySelector(".entry-content p:first-of-type");
  const creditsEl = document.querySelector(".entry-content p:last-of-type");

  const author = bylineEl?.textContent?.trim().split(": ")[1];
  const imageCredits = creditsEl
    ?.querySelector("em")
    ?.innerHTML.trim()
    .split(": ")[1];

  const elements = [
    ...document.querySelectorAll(
      ".entry-content p, .entry-content h2, .entry-content h3, .entry-content ol, .entry-content ul",
    ),
  ].filter((el) => el.innerHTML !== "");

  /* the byline and the image credits sit in the body as ordinary paragraphs,
     so the pass that reads them out is the one that takes them off. leaving
     them in left every caller to re-derive the same trim, and they did — three
     different ways, one of which missed the credits entirely.

     the two are identified differently because the archive writes them
     differently. bylines carry no consistent label ("Article by:", "Article
     By:", "Puzzle by:", "Activity by:", "Credits:"), so the opening paragraph
     counts as the byline whenever a name could be read off it at all. image
     credits are labelled the same way every time, and matching the label
     rather than the parsed name also catches the ones that credit nobody */
  const body = elements.filter(
    (el) =>
      !(el === bylineEl && author !== undefined) &&
      !(el === creditsEl && hasCreditsLabel(el)),
  );

  return { author, imageCredits, body };
}

/**
 * the one post matching a slug
 *
 * this reads the rest api rather than the rendered page: the page is 183 KB of
 * theme chrome around the same content the api returns in about 10 KB, and a
 * bare slug permalink 301s to its dated form on the way in, which the api skips
 */
async function fetchPost(slug: string): Promise<WordPressPost> {
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
    } catch (thrown) {
      // a refused connection or dns wobble is no less worth falling back on
      // than a refusal we can read a status off
      const reason = thrown instanceof Error ? thrown.message : String(thrown);
      throw new Unavailable(`${slug}: ${reason}`);
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

    if (!res.ok)
      throw new Error(`wordpress returned ${res.status} for ${slug}`);

    const [post] = (await res.json()) as WordPressPost[];
    if (!post) throw new Error(`no published post matches ${slug}`);

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

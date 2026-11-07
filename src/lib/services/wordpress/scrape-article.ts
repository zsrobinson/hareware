/*
  An article, read from WordPress's REST API in the browser (ADR 0012): the API
  answers any origin, and parsing a body is more CPU than a Worker request may
  spend. The rendered-page fallback went with the move: a page cannot be read
  cross-origin, and from each reader's own address the API's throttle, which is
  per address, is far less likely to bite than it was from one Worker.
*/

import { scrub, scrubFragment } from "./scrub-html";
import { parseDocument } from "./parse-document";
import { toArticleSlug } from "./article-url";
import { articleUrl, latestUrl } from "./urls";
import { readWordPress } from "./request";

type Term = { name: string; taxonomy: string };

/** a post as the wordpress rest api returns it */
export type WordPressPost = {
  title: { rendered: string };
  content: { rendered: string };
  date: string;
  link: string;
  jetpack_featured_media_url?: string;
  _embedded?: { "wp:term"?: Term[][] };
};

/** the article a link names, read from the API */
export async function scrapeArticle(link: string) {
  return fromPost(await fetchPost(toArticleSlug(link)));
}

/** the fields we need, off a rest api response */
export function fromPost(post: WordPressPost) {
  // content.rendered is the markup that lands inside .entry-content on the
  // page, so wrapping it lets one set of selectors serve both sources
  /* wordpress decides this markup, so it is scrubbed before anything reads it
     — see ~/lib/services/wordpress/scrub-html for what that is defending against */
  const document = scrub(
    parseDocument(`<div class="entry-content">${post.content.rendered}</div>`),
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
  const res = await readWordPress(articleUrl(slug), `the article ${slug}`);
  if (!res.ok) throw new Error(`wordpress returned ${res.status} for ${slug}`);

  const [post] = (await res.json()) as WordPressPost[];
  if (!post) throw new Error(`no published post matches ${slug}`);

  return post;
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

/**
 * the latest articles, each read as `scrapeArticle` reads one, in a single
 * request rather than one per article: the newsletter needs ten of them
 */
export async function recentArticles(count: number) {
  const res = await readWordPress(latestUrl(count), "the latest articles");
  if (!res.ok) throw new Error(`wordpress returned ${res.status}`);

  const posts = (await res.json()) as WordPressPost[];
  return posts.map(fromPost);
}

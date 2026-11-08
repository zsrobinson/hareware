/*
  The REST API addresses the browser reads. Kept in one place because a page
  starts the same request from an inline script before its JavaScript arrives
  (~/lib/early), and the island has to ask for exactly the same address to pick
  that request up rather than send a second one.
*/

import { ORIGIN } from "./article-url";

/** WordPress's REST API, which every read here addresses */
export const WORDPRESS_API = `${ORIGIN}/wp-json/`;
export const POSTS = `${WORDPRESS_API}wp/v2/posts`;
export const CATEGORIES = `${WORDPRESS_API}wp/v2/categories`;

/** where HareWare passes the same requests through: ./pass-through */
export const PASS_THROUGH = "/api/wordpress/";

/** the pass-through's own key: ask past every cache (./pass-through) */
export const FRESH = "fresh";

/**
 * the same request through HareWare, which WordPress answers from its cache,
 * or with `fresh`, from its server; anything else is left as it is
 */
export const viaHareWare = (url: string, { fresh = false } = {}) => {
  if (!url.startsWith(WORDPRESS_API)) return url;
  const through = `${PASS_THROUGH}${url.slice(WORDPRESS_API.length)}`;
  return fresh
    ? `${through}${through.includes("?") ? "&" : "?"}${FRESH}=1`
    : through;
};

/** how many articles the newsletter lists */
export const NEWSLETTER_COUNT = 10;

/**
 * the page of the recent list an address asks for, 1 when it names none or
 * nonsense. The inline script reads `?page=` the same way in its own source,
 * and ~/lib/early.test holds the two together
 */
export const pageOf = (search: URLSearchParams) =>
  Math.max(1, Number(search.get("page")) || 1);

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

/** one article, by its slug */
export const articleUrl = (slug: string) =>
  `${POSTS}?${new URLSearchParams({ slug, _embed: "wp:term", _fields: FIELDS })}`;

/** a page of the ten newest articles' titles, for Instagram Posts' landing */
export const recentUrl = (page: number | string) =>
  `${POSTS}?${new URLSearchParams({
    per_page: "10",
    page: String(page),
    status: "publish",
    _fields: "title,link,date",
  })}`;

/** the newest articles with their bodies, for the newsletter */
export const latestUrl = (count: number) =>
  `${POSTS}?${new URLSearchParams({
    per_page: String(count),
    status: "publish",
    _embed: "wp:term",
    _fields: FIELDS,
  })}`;

/** several articles at once, by slug: the Word Counter's whole column in one
    request, where one each drew 429s */
export const articlesUrl = (slugs: string[]) =>
  `${POSTS}?${new URLSearchParams({
    slug: slugs.join(","),
    per_page: String(Math.max(1, slugs.length)),
    _embed: "wp:term",
    _fields: `${FIELDS},slug`,
  })}`;

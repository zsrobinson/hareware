/*
  The REST API addresses the browser reads. Kept in one place because a page
  starts the same request from an inline script before its JavaScript arrives
  (~/lib/early), and the island has to ask for exactly the same address to pick
  that request up rather than send a second one.
*/

import { ORIGIN } from "./article-url";

const POSTS = `${ORIGIN}/wp-json/wp/v2/posts`;

/**
 * everything we need off a post, in one request. _links looks redundant next to
 * _embed but isn't — _embed builds itself out of the links, and asking for
 * fields without it silently returns no _embedded at all
 */
export const FIELDS = [
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

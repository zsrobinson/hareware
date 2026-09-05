/*
  turning notion pages into index rows, and the two paths that do it: the
  hourly rebuild and the webhook.

  the mapping is a pure function over a page object, because that is where the
  bugs are. every property on an Article is optional in practice — a row often
  exists with nothing but a Headline while somebody is still typing it — and
  `Article Status` is a `status` where `Section` is a `select`, which are
  different shapes carrying the same word. see ADR 0009.
*/

import { notion } from "~/lib/services/notion/client";
import {
  failed,
  misconfigured,
  ok,
  skipped,
  type Result,
} from "~/lib/automations/registry";
import { ARTICLES_DATA_SOURCE_ID, ARTICLE_PROPERTIES } from "./config";
import { remove, replaceAll, upsert, type IndexEntry } from "./store";

/**
 * a property value, in every shape we read.
 *
 * wider than the client's `NotionProperty` because the client describes what
 * the meeting reminder needs; an Article carries statuses, selects and
 * relations too. every field is optional and nullable on purpose — notion
 * sends `null`, not an absent key, for an empty one
 */
export type ArticleProperty = {
  type?: string;
  title?: { plain_text: string }[] | null;
  rich_text?: { plain_text: string }[] | null;
  date?: { start?: string | null } | null;
  status?: { name?: string | null } | null;
  select?: { name?: string | null } | null;
  relation?: { id: string }[] | null;
};

/** a page as the Articles data source returns it */
export type ArticlePage = {
  id: string;
  last_edited_time?: string;
  /* notion's two words for the same thing, depending on endpoint age */
  in_trash?: boolean;
  archived?: boolean;
  properties: Record<string, ArticleProperty>;
};

/*
  older than anything notion can return, so a page that arrived without a
  timestamp loses every version guard instead of winning every one of them.
  the rebuild will correct it within the hour
*/
const NO_TIMESTAMP = "1970-01-01T00:00:00.000Z";

/** what an untitled row is called, because discord rejects an empty choice */
const UNTITLED = "Untitled";

const plainText = (parts: { plain_text: string }[] | null | undefined) =>
  (parts ?? []).map((part) => part.plain_text).join("");

/**
 * the chosen option's name, whichever of the two shapes it arrived in.
 *
 * a `status` carries it under `status` and a `select` under `select`. read
 * tolerantly here because the index only wants the label, and a property
 * somebody converted from one to the other in notion should show its value
 * rather than go blank until the code catches up. writes are the opposite and
 * have to know which they are talking to
 */
export function optionName(property: ArticleProperty | undefined) {
  return property?.status?.name ?? property?.select?.name ?? null;
}

/** notion's id of every related page, or `[]` — see `assertProperties` */
export function relationIds(property: ArticleProperty | undefined) {
  return (property?.relation ?? []).map((related) => related.id);
}

/** a page as the index stores it */
export function toEntry(page: ArticlePage): IndexEntry {
  const property = (key: keyof typeof ARTICLE_PROPERTIES) =>
    page.properties?.[ARTICLE_PROPERTIES[key].name];

  const headline = plainText(property("headline")?.title).trim();
  const byline = plainText(property("authorByline")?.rich_text).trim();

  return {
    pageId: page.id,
    headline: headline || UNTITLED,
    lastEdited: page.last_edited_time ?? NO_TIMESTAMP,
    section: optionName(property("section")),
    status: optionName(property("status")),
    imageStatus: optionName(property("imageStatus")),
    authorByline: byline || null,
    publicationDate: property("publicationDate")?.date?.start ?? null,
  };
}

/** every row in the Articles data source. 138 of them, so two requests */
export async function allArticles(token: string): Promise<ArticlePage[]> {
  const pages: ArticlePage[] = [];
  let cursor: string | undefined;

  do {
    const response = (await notion(
      `data_sources/${ARTICLES_DATA_SOURCE_ID}/query`,
      token,
      { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    )) as { results: ArticlePage[]; has_more?: boolean; next_cursor?: string };

    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

/**
 * the hourly rebuild: everything notion has, as a full replace.
 *
 * the diff it reports is the point as much as the rows are. a webhook that
 * quietly stopped delivering looks exactly like a healthy hour until a rebuild
 * says it added an article nobody told us about
 */
export async function rebuild(env: Env): Promise<Result> {
  const missing = [!env.NOTION_TOKEN && "NOTION_TOKEN", !env.DB && "DB"].filter(
    Boolean,
  );
  if (missing.length > 0)
    return misconfigured(`article index unset: ${missing.join(", ")}`);

  /*
    notion throwing has to become a Result rather than an exception: two of the
    three callers — the webhook route and `?sync=1` — answer with what this
    returns, and an unhandled throw reaches them as a 500 page instead of the
    per-step outcome they promise
  */
  let pages;
  try {
    pages = await allArticles(env.NOTION_TOKEN!);
  } catch (error) {
    console.error("[articles] could not read the articles", error);
    return failed(`notion refused the article list: ${String(error)}`);
  }

  const result = await replaceAll(env.DB!, pages.map(toEntry));

  if (result.status === "refused")
    return failed("notion returned no articles; kept the index it had");
  if (result.status === "unavailable")
    return failed("could not write the article index");

  const changed =
    result.added.length + result.removed.length === 0
      ? "unchanged"
      : `${result.added.length} added, ${result.removed.length} removed`;

  return ok(`rebuilt the article index: ${pages.length} articles, ${changed}`);
}

/**
 * one page, re-read and written non-authoritatively. the webhook path.
 *
 * non-authoritative because the event says only which page changed, never the
 * values, and it may arrive up to five minutes late and out of order — so it
 * applies only if it is strictly newer than what the index already holds
 */
export async function syncPage(env: Env, pageId: string): Promise<Result> {
  const missing = [!env.NOTION_TOKEN && "NOTION_TOKEN", !env.DB && "DB"].filter(
    Boolean,
  );
  if (missing.length > 0)
    return misconfigured(`article index unset: ${missing.join(", ")}`);

  let page: ArticlePage;
  try {
    page = (await notion(`pages/${pageId}`, env.NOTION_TOKEN!)) as ArticlePage;
  } catch (error) {
    /* the webhook route answers with this, and notion retries what it answers
       with an error — which is the behaviour we want, but only if it is a
       Result rather than a thrown 500 */
    console.error("[articles] could not read a changed page", error);
    return failed(`notion refused page ${pageId}: ${String(error)}`);
  }

  // a deleted page still answers, flagged, rather than 404ing
  if (page.in_trash || page.archived) {
    await remove(env.DB!, pageId);
    return ok(`removed ${pageId} from the article index`);
  }

  const entry = toEntry(page);
  const result = await upsert(env.DB!, entry, { authoritative: false });

  if (result.status === "stale")
    return skipped(`ignored a webhook for ${entry.headline}: ours is newer`);
  if (result.status === "unavailable")
    return failed(`could not index ${entry.headline}`);

  return ok(`indexed ${entry.headline}`);
}

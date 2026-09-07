/*
  talking to Notion.

  everything here is about the API and nothing about reminders — a watcher on a
  database, a slash command that looks a page up, and the meeting reminder all
  want the same three things: resolve a data source, read its schema, query it.
  they were inside the meeting reminder, which meant the second caller would
  have copied them.

  what is deliberately NOT here: which database, which property, what a row
  means. that belongs to whatever is asking.
*/

import { mapLimit } from "~/lib/map-limit";
import { sendPatiently } from "~/lib/rate-limit";

// https://developers.notion.com/reference/versioning — pinned explicitly
// rather than omitted, since an unpinned request rides whatever the account's
// default happens to be and can change shape without warning
const NOTION_VERSION = "2026-03-11";

/** a page as we read it: its url, and whatever properties it carries */
export type NotionPage = {
  url: string;
  properties: Record<string, NotionProperty>;
};

/** a property can be almost anything; these are the shapes we know how to read */
export type NotionProperty = {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  date?: { start: string } | null;
  /* the meeting reminder reads Meetings' `Type` to tell a board meeting from a
     general body one — see ADR 0010 */
  select?: { name?: string | null } | null;
};

export class NotionError extends Error {}

/**
 * every request wants the same headers, and none may echo the token.
 *
 * the method is inferred from the body — a read has none — with `method` there
 * for the one case that breaks the rule: updating a page is a `PATCH` with a
 * body, and sending it as a `POST` creates a second page rather than failing.
 *
 * every caller in the codebase goes through here, so a 429 is waited out here
 * and nowhere else. `sendPatiently` is a retry and not a queue: it keeps a
 * burst that crossed the budget from reaching a page as an error, while
 * `together` below is what keeps the burst from happening
 */
export async function notion(
  path: string,
  token: string,
  body?: unknown,
  method?: "POST" | "PATCH",
) {
  const response = await sendPatiently(
    () =>
      fetch(`https://api.notion.com/v1/${path}`, {
        method: method ?? (body ? "POST" : "GET"),
        headers: {
          authorization: `Bearer ${token}`,
          "notion-version": NOTION_VERSION,
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    /* the path names the call and carries no token */
    `notion ${path}`,
  );

  if (!response.ok) {
    // the status and body are safe to surface; the request headers are not
    throw new NotionError(
      `notion returned ${response.status} for ${path}: ${await response.text()}`,
    );
  }

  return response.json();
}

/**
 * the data source inside a database.
 *
 * a database is a container in the current API and holds no properties of its
 * own — the schema and the rows both live on a data source inside it, so
 * `databases/{id}/query` is not an endpoint and `databases/{id}` comes back
 * with an empty `properties`. this is the first thing every caller needs and
 * the first thing every caller gets wrong
 */
export async function dataSource(
  databaseId: string,
  token: string,
): Promise<string> {
  const database = (await notion(`databases/${databaseId}`, token)) as {
    data_sources: { id: string }[];
  };

  const source = database.data_sources[0]?.id;
  if (!source)
    throw new NotionError(`database ${databaseId} has no data source`);

  return source;
}

/**
 * the name of the first property of a given type on a data source.
 *
 * asked of the schema rather than hardcoded, so renaming a column in Notion
 * does not break a caller quietly. pass an override when a second property of
 * the same type would make the guess ambiguous
 */
export async function propertyOfType(
  source: string,
  token: string,
  type: string,
  override?: string,
): Promise<string> {
  if (override) return override;

  const schema = (await notion(`data_sources/${source}`, token)) as {
    properties: Record<string, { type: string }>;
  };

  const found = Object.entries(schema.properties).find(
    ([, property]) => property.type === type,
  );
  if (!found) throw new NotionError(`no ${type} property on ${source}`);

  return found[0];
}

/** rows matching a filter, in Notion's own filter language */
export async function query(
  source: string,
  token: string,
  filter: unknown,
  pageSize = 25,
): Promise<NotionPage[]> {
  const data = (await notion(`data_sources/${source}/query`, token, {
    filter,
    page_size: pageSize,
  })) as { results: NotionPage[] };

  return data.results;
}

/**
 * every row a query matches, following `has_more` to the end.
 *
 * `query` above returns one page and is right for a caller that wants the
 * first few; this is for the ones that need all of them. Notion caps a page at
 * 100 and reports more with a cursor, so a caller reading only the first gets
 * a plausible answer quietly missing everybody after the hundredth — a whole
 * class of bug that reads as "that member has no articles".
 *
 * generic in the row so each caller keeps its own shape; this knows only how
 * notion pages a response
 */
export async function queryAll<T>(
  source: string,
  token: string,
  body: Record<string, unknown> = {},
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | undefined;

  do {
    const response = (await notion(`data_sources/${source}/query`, token, {
      page_size: 100,
      ...body,
      ...(cursor ? { start_cursor: cursor } : {}),
    })) as { results: T[]; has_more?: boolean; next_cursor?: string | null };

    rows.push(...response.results);
    cursor = response.has_more
      ? (response.next_cursor ?? undefined)
      : undefined;
  } while (cursor);

  return rows;
}

/** the plain text of a page's title property, whatever that property is called */
export function title(page: NotionPage): string {
  const property = Object.values(page.properties).find(
    (p) => p.type === "title",
  );

  return (property?.title ?? []).map((part) => part.plain_text).join("");
}

/** the plain text of the first rich-text property, if the page has one */
export function richText(page: NotionPage): string | undefined {
  const property = Object.values(page.properties).find(
    (p) => p.type === "rich_text",
  );
  const text = (property?.rich_text ?? [])
    .map((part) => part.plain_text)
    .join("");

  return text.trim() || undefined;
}

/**
 * the text of a notion rich-text or title array.
 *
 * every caller that reads a property needs this, and it was written out
 * identically in four files under `articles/` — a shape notion decides, so it
 * belongs beside the rest of what notion's shapes mean
 */
export function plainText(
  parts: { plain_text: string }[] | null | undefined,
): string {
  return (parts ?? []).map((part) => part.plain_text).join("");
}

/**
 * how many notion reads a page may have in flight at once.
 *
 * the budget is about three requests a second per integration, and two lanes
 * rather than three because the reads in a lane are not one request each:
 * `contributions()` pages twice back to back and `queryAll` will page further
 * as the article corpus grows, so two lanes already produce three or four
 * requests in a second. The retry in `notion()` above is the backstop; this is
 * the thing that keeps it from being needed
 */
const LANES = 2;

/** the tasks' results, in the order the tasks were given */
type Results<T extends readonly (() => Promise<unknown>)[]> = {
  -readonly [K in keyof T]: Awaited<ReturnType<T[K]>>;
};

/**
 * runs notion reads concurrently, but never more than `LANES` at once.
 *
 * `Promise.all` over a page's reads is what put five requests on the wire in
 * one tick, which is above the budget before a single one has finished. This
 * keeps them concurrent — serialising them would add a round trip per read to
 * a page that is `no-store` and therefore re-read on every visit — and only
 * bounds how many are in the air.
 *
 * takes thunks rather than promises: a promise handed in has already started,
 * so a `Promise.all` renamed to this would look bounded and burst anyway
 */
export async function together<
  const T extends readonly (() => Promise<unknown>)[],
>(tasks: T): Promise<Results<T>> {
  const done = await mapLimit([...tasks], LANES, (task) => task());
  return done as Results<T>;
}

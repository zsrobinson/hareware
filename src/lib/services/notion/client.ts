/*
  talking to Notion.

  everything here is about the API and nothing about any one caller: every
  caller wants the same things — read a data source's schema, query it — and a
  second copy of them is how they drift.

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
 * a plausible answer quietly missing every row after the hundredth.
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
    cursor = next(response, `data_sources/${source}/query`);
  } while (cursor);

  return rows;
}

/**
 * the cursor to the next page, or undefined on the last. `has_more` with no
 * cursor is a short answer with no way to finish it, so it throws rather than
 * returning what it has
 */
function next(
  page: { has_more?: boolean; next_cursor?: string | null },
  path: string,
): string | undefined {
  if (!page.has_more) return undefined;
  if (!page.next_cursor) {
    throw new NotionError(`notion said ${path} has more but gave no cursor`);
  }
  return page.next_cursor;
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
 * rather than three because the reads in a lane are not one request each: a
 * `queryAll` over a large data source pages back to back, so two lanes already
 * produce three or four requests in a second. The retry in `notion()` above is the backstop; this is
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

/** a relation property as notion puts it inside a page object */
export type RelationProperty = {
  /** the property's own id, which the property item endpoint is keyed by */
  id?: string;
  relation?: { id: string }[] | null;
  /** notion's only sign that `relation` was cut short at 25 */
  has_more?: boolean;
};

/**
 * every id in a relation property, including the ones a page object omits.
 *
 * notion truncates a relation to 25 entries wherever it appears inside a page
 * — a `pages/{id}` read and a data source query alike — and says so only with
 * `has_more` on the property. Nothing else about the answer looks short.
 *
 * the page's own copy where it is whole, and a second read through the
 * property item endpoint only where it was cut short
 */
export async function relationIds(
  pageId: string,
  property: RelationProperty,
  token: string,
): Promise<string[]> {
  if (!property.has_more) {
    return (property.relation ?? []).map((related) => related.id);
  }
  if (!property.id) {
    throw new NotionError(
      `a relation on ${pageId} was cut short and carries no id to read the rest by`,
    );
  }

  return pagedRelation(pageId, property.id, token);
}

/**
 * the whole of a relation from the property item endpoint, which pages.
 *
 * `property` is the property's own id from the page object, not its name, and
 * it goes into the path **verbatim**.
 *
 * verbatim is load-bearing. notion hands these ids back already
 * percent-encoded — `c%3CLo`, `%5CClH` — so encoding them again asks for a
 * property that does not exist. Measured against the real database: the id as
 * given answers with twelve related pages, and the same id put through
 * `encodeURIComponent` answers `200` with an empty list. Not a 404, not an
 * error; an empty relation, which a caller merging against it writes back
 */
async function pagedRelation(
  pageId: string,
  property: string,
  token: string,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;

  do {
    const path = `pages/${pageId}/properties/${property}`;
    const page = (await notion(
      `${path}?page_size=100${
        cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""
      }`,
      token,
    )) as {
      results?: { relation?: { id: string } | null }[] | null;
      has_more?: boolean;
      next_cursor?: string | null;
    };

    for (const item of page.results ?? []) {
      if (item.relation?.id) ids.push(item.relation.id);
    }

    cursor = next(page, path);
  } while (cursor);

  return ids;
}

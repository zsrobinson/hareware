/*
  talking to Notion's API. Which database, which property and what a row means
  belong to the caller. The traps are in docs/agents/silent-failures.md.
*/

import { mapLimit } from "~/lib/map-limit";
import { sendPatiently } from "~/lib/rate-limit";

// pinned: an unpinned request follows the account's default version, which
// can change shape. https://developers.notion.com/reference/versioning
const NOTION_VERSION = "2026-03-11";

export type NotionPage = {
  url: string;
  properties: Record<string, NotionProperty>;
};

/** the property shapes these helpers read */
export type NotionProperty = {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  date?: { start: string } | null;
  select?: { name?: string | null } | null;
};

export class NotionError extends Error {}

/**
 * one request, with a 429 waited out. The method is inferred from the body;
 * an update must pass `"PATCH"`, because a `POST` with a body creates a page
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
    `notion ${path}`,
  );

  if (!response.ok) {
    throw new NotionError(
      `notion returned ${response.status} for ${path}: ${await response.text()}`,
    );
  }

  return response.json();
}

/**
 * the name of the first property of a type, from the schema. Pass `override`
 * when a second property of the type would make the guess ambiguous
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

/** every row a query matches: notion answers 100 at a time, and `query` stops at one page */
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

/** the next cursor, or undefined on the last page. `has_more` with no cursor throws */
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

/** the text of a notion rich-text or title array */
export function plainText(
  parts: { plain_text: string }[] | null | undefined,
): string {
  return (parts ?? []).map((part) => part.plain_text).join("");
}

/* notion allows about three requests a second, and a lane running `queryAll`
   pages back to back, so two lanes is already three or four a second */
const LANES = 2;

/** the tasks' results, in the order the tasks were given */
type Results<T extends readonly (() => Promise<unknown>)[]> = {
  -readonly [K in keyof T]: Awaited<ReturnType<T[K]>>;
};

/**
 * notion reads run concurrently, never more than `LANES` at once. Takes thunks
 * because a promise handed in has already started
 */
export async function together<
  const T extends readonly (() => Promise<unknown>)[],
>(tasks: T): Promise<Results<T>> {
  const done = await mapLimit([...tasks], LANES, (task) => task());
  return done as Results<T>;
}

/**
 * a relation property as notion puts it inside a page object. A relation the
 * integration cannot reach is left out of the page entirely, so a missing
 * property must not be read as an empty one
 */
export type RelationProperty = {
  /** the property's own id, which the property item endpoint is keyed by */
  id?: string;
  relation?: { id: string }[] | null;
  /** notion's only sign that `relation` was cut short at 25 */
  has_more?: boolean;
};

/**
 * every id in a relation property. Notion cuts a relation inside a page or a
 * query result to 25 and says so only with `has_more`; only then is the rest
 * read from the property item endpoint
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
 * a whole relation from the property item endpoint. `property` is the
 * property's id and goes into the path verbatim: notion returns it already
 * percent-encoded (`c%3CLo`), and encoding it again answers 200 with an empty
 * list
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

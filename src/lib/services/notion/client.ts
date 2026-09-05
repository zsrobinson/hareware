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
};

export class NotionError extends Error {}

/**
 * every request wants the same headers, and none may echo the token.
 *
 * the method is inferred from the body — a read has none — with `method` there
 * for the one case that breaks the rule: updating a page is a `PATCH` with a
 * body, and sending it as a `POST` creates a second page rather than failing
 */
export async function notion(
  path: string,
  token: string,
  body?: unknown,
  method?: "POST" | "PATCH",
) {
  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      authorization: `Bearer ${token}`,
      "notion-version": NOTION_VERSION,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

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

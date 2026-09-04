import { afterEach, expect, test, vi } from "vitest";
import {
  assertProperties,
  extractChoices,
  readChoices,
  refreshChoices,
  type Schema,
} from "./choices";
import { ARTICLE_PROPERTIES } from "./config";

const options = (...names: string[]) => names.map((name) => ({ name }));

/** the Articles schema as notion returns it when everything is shared */
const schema = (over: Schema["properties"] = {}): Schema => ({
  properties: {
    Headline: { type: "title" },
    "Article Status": {
      type: "status",
      status: { options: options("Backlog", "Approved", "Published") },
    },
    "Image Status": {
      type: "status",
      status: { options: options("Not Started", "Done") },
    },
    Section: {
      type: "select",
      select: { options: options("News", "Rabbithole") },
    },
    "Author Byline": { type: "rich_text" },
    "Image Byline": { type: "rich_text" },
    "Publication Date": { type: "date" },
    Author: { type: "relation" },
    "Image Crew": { type: "relation" },
    ...over,
  },
});

afterEach(() => vi.unstubAllGlobals());

/* ---- the schema check --------------------------------------------------- */

test("a schema with everything shared is missing nothing", () => {
  expect(assertProperties(schema())).toEqual([]);
});

test("a relation notion omitted is reported, because its value reads as []", () => {
  /* the whole point: when Members is not shared with the integration, notion
     drops `Author` from the schema and the page's value comes back `[]` —
     identical to an article with no author. an append built on that read would
     delete co-authors nobody could see */
  const withoutAuthor = schema();
  delete withoutAuthor.properties["Author"];

  expect(assertProperties(withoutAuthor)).toEqual([
    { name: "Author", expected: "relation", found: null },
  ]);
});

test("a property that changed type is reported as well as one that vanished", () => {
  const changed = assertProperties(
    schema({ "Article Status": { type: "select", select: { options: [] } } }),
  );

  expect(changed).toEqual([
    { name: "Article Status", expected: "status", found: "select" },
  ]);
});

/* ---- the options -------------------------------------------------------- */

test("the options come out in notion's own order, per property", () => {
  expect(extractChoices(schema())).toEqual([
    { property: "Article Status", name: "Backlog", position: 0 },
    { property: "Article Status", name: "Approved", position: 1 },
    { property: "Article Status", name: "Published", position: 2 },
    { property: "Image Status", name: "Not Started", position: 0 },
    { property: "Image Status", name: "Done", position: 1 },
    { property: "Section", name: "News", position: 0 },
    { property: "Section", name: "Rabbithole", position: 1 },
  ]);
});

test("a status and a select hold their options in different places", () => {
  const names = extractChoices(schema()).map((choice) => choice.name);

  // `Article Status` is a status and `Section` a select; both were read
  expect(names).toContain("Published");
  expect(names).toContain("Rabbithole");
});

test("option names keep notion's casing, traps included", () => {
  const choices = extractChoices(
    schema({
      "Article Status": {
        type: "status",
        status: { options: options("Not started") },
      },
    }),
  );

  expect(choices[0]!.name).toBe("Not started");
});

/* ---- the wrappers ------------------------------------------------------- */

type Statement = { sql: string; params: unknown[] };

function fakeD1(answer: (sql: string) => unknown[][] = () => []) {
  const statements: Statement[] = [];

  const client = {
    prepare(sql: string) {
      const statement: Statement = { sql, params: [] };
      statements.push(statement);

      const prepared = {
        bind(...params: unknown[]) {
          statement.params = params;
          return prepared;
        },
        async all() {
          return { results: answer(sql), success: true, meta: {} };
        },
        async raw() {
          return answer(sql);
        },
        async run() {
          return { success: true, meta: {} };
        },
      };

      return prepared;
    },
    async batch(queries: unknown[]) {
      return queries.map(() => ({ results: [], success: true, meta: {} }));
    },
  };

  return { db: client as unknown as D1Database, statements };
}

const mockSchema = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body))),
  );

const env = (db: D1Database) =>
  ({ NOTION_TOKEN: "notion-token", DB: db }) as unknown as Env;

test("a refresh writes the options it read", async () => {
  const { db, statements } = fakeD1();
  mockSchema(schema());

  const result = await refreshChoices(env(db));

  expect(result.outcome).toBe("ok");
  const written = statements.map((s) => s.sql.toLowerCase());
  expect(written.some((sql) => sql.startsWith("delete"))).toBe(true);
  expect(written.some((sql) => sql.startsWith("insert"))).toBe(true);
});

test("a refresh refuses to write when a property is missing", async () => {
  const { db, statements } = fakeD1();
  const withoutAuthor = schema();
  delete withoutAuthor.properties["Author"];
  mockSchema(withoutAuthor);

  const result = await refreshChoices(env(db));

  expect(result.outcome).toBe("misconfigured");
  expect(result.summary).toContain("Author");
  expect(statements).toEqual([]);
});

test("a refresh refuses a property that came back with no options at all", async () => {
  const { db, statements } = fakeD1();
  mockSchema(schema({ Section: { type: "select", select: { options: [] } } }));

  const result = await refreshChoices(env(db));

  expect(result.outcome).toBe("failed");
  expect(result.summary).toContain("Section");
  expect(statements).toEqual([]);
});

test("a refresh with no notion token does not report success", async () => {
  const { db } = fakeD1();

  const result = await refreshChoices({ DB: db } as unknown as Env);
  expect(result.outcome).toBe("misconfigured");
  expect(result.summary).toContain("NOTION_TOKEN");
});

test("readChoices asks for them in notion's order and never throws", async () => {
  const { db, statements } = fakeD1();

  await readChoices(db);
  expect(statements[0]!.sql.toLowerCase()).toContain("order by");

  const broken = {
    prepare() {
      throw new Error("d1 is unreachable");
    },
  } as unknown as D1Database;
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(readChoices(broken)).resolves.toEqual([]);
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

test("every property the commands touch is checked, not only the pickers", () => {
  // the pickers are three properties; the data-loss guard is about all nine
  const empty = { properties: {} };
  expect(
    assertProperties(empty)
      .map((miss) => miss.name)
      .sort(),
  ).toEqual(
    Object.values(ARTICLE_PROPERTIES)
      .map((property) => property.name)
      .sort(),
  );
});

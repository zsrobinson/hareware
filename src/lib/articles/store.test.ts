import { expect, test, vi } from "vitest";
import {
  diffPageIds,
  likePattern,
  remove,
  replaceAll,
  search,
  upsert,
  wins,
  type IndexEntry,
} from "./store";

/*
  a hand-written D1, because there is no test harness for the real one and this
  task is not the place to introduce one. it records the sql drizzle builds and
  answers with whatever rows the test names, which is enough to prove a query
  went out — or, for the version guard, that one did not
*/
type Statement = { sql: string; params: unknown[] };

function fakeD1(
  answer: (sql: string) => unknown[][] = () => [],
  broken = false,
) {
  const statements: Statement[] = [];

  const client = {
    prepare(sql: string) {
      const statement: Statement = { sql, params: [] };
      statements.push(statement);

      const rows = () => {
        if (broken) throw new Error("d1 is unreachable");
        return answer(sql);
      };

      const prepared = {
        bind(...params: unknown[]) {
          statement.params = params;
          return prepared;
        },
        async all() {
          return { results: rows(), success: true, meta: {} };
        },
        async raw() {
          return rows();
        },
        async run() {
          rows();
          return { success: true, meta: {} };
        },
      };

      return prepared;
    },
    async batch(queries: unknown[]) {
      if (broken) throw new Error("d1 is unreachable");
      return queries.map(() => ({ results: [], success: true, meta: {} }));
    },
  };

  return { db: client as unknown as D1Database, statements };
}

const sqlOf = (statements: Statement[]) =>
  statements.map((s) => s.sql.toLowerCase());

const entry = (over: Partial<IndexEntry> = {}): IndexEntry => ({
  pageId: "page-1",
  headline: "Looney's line wraps around Earth",
  lastEdited: "2026-09-04T10:05:00.000Z",
  ...over,
});

/* ---- the pure parts ----------------------------------------------------- */

test("a search pattern is lowercased and its wildcards are escaped", () => {
  expect(likePattern("Looney")).toBe("%looney%");
  // a headline about a 50% cut must not match every row in the table
  expect(likePattern("50%")).toBe("%50\\%%");
  expect(likePattern("a_b")).toBe("%a\\_b%");
  expect(likePattern("back\\slash")).toBe("%back\\\\slash%");
});

test("an authoritative write wins even against a newer stored row", () => {
  expect(
    wins("2026-09-04T10:00:00.000Z", "2026-09-04T10:05:00.000Z", true),
  ).toBe(true);
});

test("an authoritative write wins a tie, because notion's clock has minutes", () => {
  const same = "2026-09-04T10:05:00.000Z";
  expect(wins(same, same, true)).toBe(true);
  expect(wins(same, same, false)).toBe(false);
});

test("a webhook or rebuild applies only when strictly newer", () => {
  expect(
    wins("2026-09-04T10:06:00.000Z", "2026-09-04T10:05:00.000Z", false),
  ).toBe(true);
  expect(
    wins("2026-09-04T10:04:00.000Z", "2026-09-04T10:05:00.000Z", false),
  ).toBe(false);
  // a row we have never seen is not stale, whoever is asking
  expect(wins("2026-09-04T10:04:00.000Z", undefined, false)).toBe(true);
});

test("the diff names what a rebuild added and removed", () => {
  expect(diffPageIds(["a", "b", "c"], ["b", "c", "d"])).toEqual({
    added: ["d"],
    removed: ["a"],
  });
});

/* ---- the wrappers ------------------------------------------------------- */

test("search asks for a case-insensitive match, newest first, capped", async () => {
  const { db, statements } = fakeD1();

  await search(db, "LOONEY", 25);

  const [select] = statements;
  expect(select!.sql.toLowerCase()).toContain("lower(");
  expect(select!.sql.toLowerCase()).toContain("order by");
  expect(select!.params).toContain("%looney%");
  expect(select!.params).toContain(25);
});

test("search reports nothing rather than throwing at an autocomplete", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { db } = fakeD1(() => [], true);

  await expect(search(db, "looney", 25)).resolves.toEqual([]);
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

test("a non-authoritative write is dropped when the stored row is newer", async () => {
  const { db, statements } = fakeD1((sql) =>
    sql.toLowerCase().startsWith("select")
      ? [["2026-09-04T10:05:00.000Z"]]
      : [],
  );

  const result = await upsert(
    db,
    entry({ lastEdited: "2026-09-04T10:04:00.000Z" }),
    { authoritative: false },
  );

  expect(result.status).toBe("stale");
  expect(sqlOf(statements).some((sql) => sql.startsWith("insert"))).toBe(false);
});

test("an authoritative write goes in over the same stored timestamp", async () => {
  const { db, statements } = fakeD1((sql) =>
    sql.toLowerCase().startsWith("select")
      ? [["2026-09-04T10:05:00.000Z"]]
      : [],
  );

  const result = await upsert(
    db,
    entry({ lastEdited: "2026-09-04T10:05:00.000Z" }),
    { authoritative: true },
  );

  expect(result.status).toBe("written");
  expect(sqlOf(statements).some((sql) => sql.startsWith("insert"))).toBe(true);
});

test("a newer webhook write goes in", async () => {
  const { db, statements } = fakeD1((sql) =>
    sql.toLowerCase().startsWith("select")
      ? [["2026-09-04T10:05:00.000Z"]]
      : [],
  );

  const result = await upsert(
    db,
    entry({ lastEdited: "2026-09-04T10:06:00.000Z" }),
    { authoritative: false },
  );

  expect(result.status).toBe("written");
  expect(sqlOf(statements).some((sql) => sql.startsWith("insert"))).toBe(true);
});

test("upsert reports an unreachable index rather than failing the command", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { db } = fakeD1(() => [], true);

  const result = await upsert(db, entry(), { authoritative: true });

  expect(result.status).toBe("unavailable");
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

test("a rebuild replaces the table and names what changed", async () => {
  const { db, statements } = fakeD1((sql) =>
    sql.toLowerCase().startsWith("select") ? [["page-1"], ["page-gone"]] : [],
  );

  const result = await replaceAll(db, [entry(), entry({ pageId: "page-new" })]);

  expect(result).toEqual({
    status: "replaced",
    added: ["page-new"],
    removed: ["page-gone"],
  });
  expect(sqlOf(statements).some((sql) => sql.startsWith("delete"))).toBe(true);
  expect(sqlOf(statements).some((sql) => sql.startsWith("insert"))).toBe(true);
});

test("a rebuild that found no articles refuses to empty the index", async () => {
  const { db, statements } = fakeD1();

  const result = await replaceAll(db, []);

  expect(result.status).toBe("refused");
  expect(sqlOf(statements).some((sql) => sql.startsWith("delete"))).toBe(false);
});

test("remove deletes one page and never throws", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { db, statements } = fakeD1();

  await remove(db, "page-1");
  expect(sqlOf(statements).some((sql) => sql.startsWith("delete"))).toBe(true);
  expect(statements.at(-1)!.params).toContain("page-1");

  const broken = fakeD1(() => [], true);
  await expect(remove(broken.db, "page-1")).resolves.toBeUndefined();
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

/*
  the bug this pair exists for: 138 articles went into one insert, which is
  about 1242 bound variables. d1 rejected the statement, `replaceAll` reported
  `unavailable`, and the index stayed empty while `choice_options` beside it
  wrote fine — so it read as the database being broken rather than as a limit.

  the ceiling asserted here is **d1's hundred**, not sqlite's 999. the first fix
  chunked to fifty rows, which is 450 variables: comfortably under sqlite's
  limit, still four times over d1's, and this test passed on it. a test is only
  worth its bound
*/
const D1_MAX_VARIABLES = 100;
test("splits a rebuild across statements that sqlite will accept", async () => {
  const { db, statements } = fakeD1();

  const many = Array.from({ length: 138 }, (_, i) =>
    entry({ pageId: `page-${i}`, headline: `Article ${i}` }),
  );

  await replaceAll(db, many);

  const inserts = statements.filter((s) =>
    s.sql.toLowerCase().startsWith("insert"),
  );

  expect(inserts.length).toBeGreaterThan(1);
  for (const insert of inserts) {
    expect(insert.params.length).toBeLessThanOrEqual(D1_MAX_VARIABLES);
  }
});

test("still writes every row, in order, once split", async () => {
  const { db, statements } = fakeD1();

  const many = Array.from({ length: 138 }, (_, i) =>
    entry({ pageId: `page-${i}`, headline: `Article ${i}` }),
  );

  const result = await replaceAll(db, many);
  expect(result.status).toBe("replaced");

  const written = statements
    .filter((s) => s.sql.toLowerCase().startsWith("insert"))
    .flatMap((s) => s.params)
    .filter((p) => typeof p === "string" && p.startsWith("page-"));

  expect(written).toEqual(many.map((e) => e.pageId));
});

/*
  the bug this exists for: the escape clause was written `escape '\'` inside a
  template literal, where `\'` is just a quote — so the emitted sql was
  `escape ''`, an empty escape string, which sqlite rejects. every search threw,
  `search` swallowed it exactly as designed, and discord showed a blank
  dropdown with nothing anywhere saying why.

  it survived a check against production because that check was typed into a
  shell, where `'\'` really is a backslash — so what got verified was a
  transcription of the code rather than the code
*/
test("the like clause carries a real escape character, not an empty one", async () => {
  const { db, statements } = fakeD1();

  await search(db, "50%");

  const select = statements.find((s) =>
    s.sql.toLowerCase().startsWith("select"),
  );

  expect(select!.sql).toContain("escape '\\'");
  expect(select!.sql).not.toContain("escape ''");
});

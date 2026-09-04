import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { rebuild, syncPage, toEntry, type ArticlePage } from "./sync";
import { remove, replaceAll, upsert } from "./store";

vi.mock("./store", () => ({
  replaceAll: vi.fn(async () => ({
    status: "replaced",
    added: [],
    removed: [],
  })),
  upsert: vi.fn(async () => ({ status: "written" })),
  remove: vi.fn(async () => {}),
}));

const env = {
  NOTION_TOKEN: "notion-token",
  DB: {} as D1Database,
} as unknown as Env;

const page = (properties: ArticlePage["properties"] = {}): ArticlePage => ({
  id: "page-1",
  last_edited_time: "2026-09-04T10:05:00.000Z",
  properties: {
    Headline: { type: "title", title: [{ plain_text: "Looney's line" }] },
    ...properties,
  },
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

/* ---- the mapper --------------------------------------------------------- */

test("a page with nothing but a headline maps to a row", () => {
  const entry = toEntry(page());

  expect(entry).toEqual({
    pageId: "page-1",
    headline: "Looney's line",
    lastEdited: "2026-09-04T10:05:00.000Z",
    section: null,
    status: null,
    imageStatus: null,
    authorByline: null,
    publicationDate: null,
  });
});

test("every property may be absent, empty or null without throwing", () => {
  const entry = toEntry({
    id: "page-1",
    last_edited_time: "2026-09-04T10:05:00.000Z",
    properties: {
      Headline: { type: "title", title: [] },
      "Article Status": { type: "status", status: null },
      Section: { type: "select", select: null },
      "Author Byline": { type: "rich_text", rich_text: [] },
      "Publication Date": { type: "date", date: null },
    },
  });

  expect(entry.status).toBeNull();
  expect(entry.section).toBeNull();
  expect(entry.authorByline).toBeNull();
  expect(entry.publicationDate).toBeNull();
});

test("a status and a select are different shapes and both are read", () => {
  const entry = toEntry(
    page({
      // `Article Status` is a status property; its name hangs off `status`
      "Article Status": { type: "status", status: { name: "Section Edited" } },
      // `Section` is a select; the same name hangs off `select` instead
      Section: { type: "select", select: { name: "Rabbithole" } },
      "Image Status": { type: "status", status: { name: "Unclaimed" } },
    }),
  );

  expect(entry.status).toBe("Section Edited");
  expect(entry.section).toBe("Rabbithole");
  expect(entry.imageStatus).toBe("Unclaimed");
});

test("a headline is the whole title, however notion split it", () => {
  const entry = toEntry(
    page({
      Headline: {
        type: "title",
        title: [{ plain_text: "Looney's line " }, { plain_text: "wraps" }],
      },
    }),
  );

  expect(entry.headline).toBe("Looney's line wraps");
});

test("an untitled article still gets a label discord will accept", () => {
  // an empty choice name makes discord reject the whole autocomplete response,
  // so a row somebody is still typing must not produce one
  expect(
    toEntry(page({ Headline: { type: "title", title: [] } })).headline,
  ).toBe("Untitled");
});

test("a date is its start, and a rich text its plain text", () => {
  const entry = toEntry(
    page({
      "Publication Date": { type: "date", date: { start: "2026-09-10" } },
      "Author Byline": {
        type: "rich_text",
        rich_text: [{ plain_text: "Gale de Silva" }],
      },
    }),
  );

  expect(entry.publicationDate).toBe("2026-09-10");
  expect(entry.authorByline).toBe("Gale de Silva");
});

test("a page with no timestamp loses every version guard rather than winning", () => {
  const entry = toEntry({
    id: "page-1",
    properties: {},
  } as unknown as ArticlePage);

  expect(entry.lastEdited).toBe("1970-01-01T00:00:00.000Z");
});

/* ---- the notion paths --------------------------------------------------- */

function mockNotion(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: { url: string; body: unknown }[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      return new Response(JSON.stringify(handler(url, init)));
    }),
  );

  return calls;
}

test("a rebuild pages through the data source and replaces the table", async () => {
  const calls = mockNotion((_url, init) => {
    const body = JSON.parse((init!.body as string) ?? "{}");
    return body.start_cursor
      ? { results: [page()], has_more: false, next_cursor: null }
      : {
          results: [{ ...page(), id: "page-0" }],
          has_more: true,
          next_cursor: "cursor-2",
        };
  });

  const result = await rebuild(env);

  expect(result.outcome).toBe("ok");
  expect(calls).toHaveLength(2);
  expect(calls[1]!.body).toMatchObject({ start_cursor: "cursor-2" });
  expect(vi.mocked(replaceAll).mock.calls[0]![1].map((e) => e.pageId)).toEqual([
    "page-0",
    "page-1",
  ]);
});

test("a rebuild that notion refused is a failure, not a quiet success", async () => {
  vi.mocked(replaceAll).mockResolvedValueOnce({ status: "refused" });
  mockNotion(() => ({ results: [page()], has_more: false }));

  expect((await rebuild(env)).outcome).toBe("failed");
});

test("a rebuild reports what the index gained and lost", async () => {
  vi.mocked(replaceAll).mockResolvedValueOnce({
    status: "replaced",
    added: ["page-new"],
    removed: ["page-gone"],
  });
  mockNotion(() => ({ results: [page()], has_more: false }));

  const result = await rebuild(env);

  expect(result.summary).toContain("1 added");
  expect(result.summary).toContain("1 removed");
});

test("a rebuild with no notion token does not report success", async () => {
  const result = await rebuild({ DB: {} } as unknown as Env);

  expect(result.outcome).toBe("misconfigured");
  expect(result.summary).toContain("NOTION_TOKEN");
});

test("a webhook fetches the page and writes it non-authoritatively", async () => {
  const calls = mockNotion(() => page());

  const result = await syncPage(env, "page-1");

  expect(calls[0]!.url).toContain("pages/page-1");
  expect(result.outcome).toBe("ok");
  expect(vi.mocked(upsert).mock.calls[0]![2]).toEqual({ authoritative: false });
});

test("a webhook write the index dropped as stale is not reported as written", async () => {
  vi.mocked(upsert).mockResolvedValueOnce({ status: "stale" });
  mockNotion(() => page());

  const result = await syncPage(env, "page-1");

  expect(result.outcome).toBe("skipped");
  expect(result.summary).toContain("newer");
});

test("a page notion says is in the trash leaves the index", async () => {
  mockNotion(() => ({ ...page(), in_trash: true }));

  const result = await syncPage(env, "page-1");

  expect(vi.mocked(remove)).toHaveBeenCalledWith(env.DB, "page-1");
  expect(vi.mocked(upsert)).not.toHaveBeenCalled();
  expect(result.outcome).toBe("ok");
});

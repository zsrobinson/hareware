import { afterEach, expect, test, vi } from "vitest";
import { forget, recentArticles, search } from "./live";

afterEach(() => {
  forget();
  vi.restoreAllMocks();
});

/**
 * the json body of the one request that was sent.
 *
 * `RequestInit["body"]` is a union including streams and blobs, so reading it
 * needs a narrowing somewhere — once here rather than at every assertion
 */
function sentBody(mock: { mock: { calls: unknown[] } }) {
  const [, init] = mock.mock.calls[0] as [string, RequestInit];

  return typeof init.body === "string" ? init.body : "";
}

const page = (id: string, headline: string) => ({
  id,
  last_edited_time: "2026-09-05T10:00:00.000Z",
  properties: {
    Headline: { type: "title", title: [{ plain_text: headline }] },
  },
});

/** notion, answering with one article and counting how often it was asked */
function notion(headline = "Terps lose again") {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ results: [page("p1", headline)] })),
  );
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

test("reads the most recently edited Articles from notion", async () => {
  notion();

  const articles = await recentArticles("token");

  expect(articles).toHaveLength(1);
  expect(articles[0]!.headline).toBe("Terps lose again");
});

/*
  the memo is why this is affordable: notion allows roughly three requests a
  second and discord fires one per keystroke, so six keystrokes have to be one
  request rather than six. it exists for that budget, not for speed
*/
test("a burst of keystrokes costs one request, not one each", async () => {
  const fetchMock = notion();

  for (let i = 0; i < 6; i++) await recentArticles("token");

  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a snapshot older than its life is not reused", async () => {
  const fetchMock = notion();
  await recentArticles("token");

  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
  await recentArticles("token");

  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("sorts by recency and asks notion to do it", async () => {
  const fetchMock = notion();
  await recentArticles("token");

  const body = JSON.parse(sentBody(fetchMock)) as {
    sorts: { timestamp: string; direction: string }[];
  };

  expect(body.sorts[0]).toEqual({
    timestamp: "last_edited_time",
    direction: "descending",
  });
});

/*
  the fallback for work older than the hundred we hold. notion's `contains` is
  a literal substring, so this is coarser than the local matching on purpose
*/
test("search asks notion for headlines containing the text", async () => {
  const fetchMock = notion("Ellicott Hall Stolen");

  const found = await search("token", "ellicott");

  const body = JSON.parse(sentBody(fetchMock)) as {
    filter: { title: { contains: string } };
  };

  expect(body.filter.title.contains).toBe("ellicott");
  expect(found[0]!.headline).toBe("Ellicott Hall Stolen");
});

test("search is never served from the snapshot", async () => {
  /* the snapshot is the recent hundred; a search is for what is not in it, so
     answering one from the other would be answering the wrong question */
  const fetchMock = notion();

  await recentArticles("token");
  await search("token", "ellicott");

  expect(fetchMock).toHaveBeenCalledTimes(2);
});

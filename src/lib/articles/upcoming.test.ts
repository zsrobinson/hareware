import { afterEach, expect, test, vi } from "vitest";
import {
  inPublicationOrder,
  publicationDay,
  upcomingArticles,
} from "./upcoming";
import { toArticle, type ArticlePage } from "./page";

afterEach(() => vi.restoreAllMocks());

const page = (
  id: string,
  headline: string,
  date: string | null,
): ArticlePage => ({
  id,
  properties: {
    Headline: { type: "title", title: [{ plain_text: headline }] },
    "Article Status": { type: "status", status: { name: "Scheduled" } },
    "Publication Date": { type: "date", date: date ? { start: date } : null },
  },
});

const article = (headline: string, date: string | null) =>
  toArticle(page("p", headline, date));

/** the two responses one call makes: the schema, then the filtered query */
function notion({
  options = ["Backlog", "Scheduled"],
  results = [] as ArticlePage[],
  hasMore = false,
} = {}) {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith("/query")
      ? new Response(JSON.stringify({ results, has_more: hasMore }))
      : new Response(
          JSON.stringify({
            properties: {
              "Article Status": {
                type: "status",
                status: { options: options.map((name) => ({ name })) },
              },
            },
          }),
        ),
  );
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

/** the json body of the query request, which is the second one sent */
function queryBody(mock: { mock: { calls: unknown[] } }) {
  const [, init] = mock.mock.calls[1] as [string, RequestInit];

  return JSON.parse(typeof init.body === "string" ? init.body : "{}");
}

test("reads the scheduled articles out of notion", async () => {
  notion({ results: [page("p1", "Terps lose again", "2026-09-12")] });

  const found = await upcomingArticles("token");

  expect(found.outcome).toBe("scheduled");
  expect(found.outcome === "scheduled" && found.articles).toHaveLength(1);
  expect(found.outcome === "scheduled" && found.articles[0]!.headline).toBe(
    "Terps lose again",
  );
});

/*
  ADR 0009: no notion value is typed into this repo. asking for "scheduled" and
  filtering on whatever notion spells it is what keeps a recased option from
  becoming a filter that matches nothing and reports success
*/
test("filters on notion's own spelling of the status, not ours", async () => {
  const fetchMock = notion({ options: ["SCHEDULED"] });

  await upcomingArticles("token");

  expect(queryBody(fetchMock).filter).toEqual({
    property: "Article Status",
    status: { equals: "SCHEDULED" },
  });
});

test("says the status is gone rather than reporting an empty schedule", async () => {
  const fetchMock = notion({ options: ["Backlog", "Published"] });

  const found = await upcomingArticles("token");

  expect(found).toEqual({ outcome: "no-such-status" });
  // and it does not go on to ask notion for rows it cannot identify
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("reports that notion held more than one query returns", async () => {
  notion({ results: [page("p1", "One", "2026-09-12")], hasMore: true });

  const found = await upcomingArticles("token");

  expect(found.outcome === "scheduled" && found.truncated).toBe(true);
});

test("a full page notion has no more of is not truncated", async () => {
  notion({ results: [page("p1", "One", "2026-09-12")] });

  const found = await upcomingArticles("token");

  expect(found.outcome === "scheduled" && found.truncated).toBe(false);
});

test("orders the schedule by the day each article publishes", async () => {
  notion({
    results: [
      page("p1", "Later", "2026-09-20"),
      page("p2", "Sooner", "2026-09-12"),
    ],
  });

  const found = await upcomingArticles("token");

  expect(
    found.outcome === "scheduled" && found.articles.map((a) => a.headline),
  ).toEqual(["Sooner", "Later"]);
});

/*
  an Article can be Scheduled with no Publication Date. dropping those would
  hide the ones that most need looking at, and putting them first would bury
  the schedule under them
*/
test("an article with no date is last, not missing", () => {
  const ordered = inPublicationOrder([
    article("Undated", null),
    article("Later", "2026-09-20"),
    article("Sooner", "2026-09-12"),
  ]);

  expect(ordered.map((a) => a.headline)).toEqual([
    "Sooner",
    "Later",
    "Undated",
  ]);
});

test("articles sharing a day are ordered by headline", () => {
  const ordered = inPublicationOrder([
    article("Beta", "2026-09-12"),
    article("Alpha", "2026-09-12"),
  ]);

  expect(ordered.map((a) => a.headline)).toEqual(["Alpha", "Beta"]);
});

test("sorting leaves the caller's array alone", () => {
  const given = [
    article("Later", "2026-09-20"),
    article("Sooner", "2026-09-12"),
  ];

  inPublicationOrder(given);

  expect(given.map((a) => a.headline)).toEqual(["Later", "Sooner"]);
});

/*
  notion writes a date-only property as `YYYY-MM-DD` and a dated one as an
  instant with an offset. parsing either through a timezone is what lands a
  bare date on the previous evening — see docs/agents/silent-failures.md
*/
test("the day is read off the string, whichever shape notion sent", () => {
  expect(publicationDay(article("a", "2026-09-12"))).toBe("2026-09-12");
  expect(publicationDay(article("a", "2026-09-12T00:30:00.000-04:00"))).toBe(
    "2026-09-12",
  );
  expect(publicationDay(article("a", null))).toBeNull();
});

test("an instant late in the day sorts by its own date, not the next one", () => {
  const ordered = inPublicationOrder([
    article("Thirteenth", "2026-09-13"),
    article("Twelfth at night", "2026-09-12T23:30:00.000-04:00"),
  ]);

  expect(ordered.map((a) => a.headline)).toEqual([
    "Twelfth at night",
    "Thirteenth",
  ]);
});

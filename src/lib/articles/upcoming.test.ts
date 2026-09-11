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
  status: string,
  date: string | null = null,
): ArticlePage => ({
  id,
  properties: {
    Headline: { type: "title", title: [{ plain_text: headline }] },
    "Article Status": { type: "status", status: { name: status } },
    "Publication Date": { type: "date", date: date ? { start: date } : null },
  },
});

const article = (headline: string, date: string | null) =>
  toArticle(page("p", headline, "Scheduled", date));

const ALL = ["Section Edited", "Managing Edited", "Scheduled", "Published"];

/** the two responses one call makes: the schema, then the filtered query */
function notion({
  options = ALL,
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

test("groups the three stages, latest first", async () => {
  notion({
    results: [
      page("p1", "Edited by the section", "Section Edited"),
      page("p2", "Ready to go", "Scheduled", "2026-09-12"),
      page("p3", "Past the managing editor", "Managing Edited"),
    ],
  });

  const found = await upcomingArticles("token");

  expect(found.groups.map((group) => group.status)).toEqual([
    "Scheduled",
    "Managing Edited",
    "Section Edited",
  ]);
  expect(found.groups.map((group) => group.articles.map((a) => a.headline)));
  expect(found.groups[0]!.articles.map((a) => a.headline)).toEqual([
    "Ready to go",
  ]);
  expect(found.groups[2]!.articles.map((a) => a.headline)).toEqual([
    "Edited by the section",
  ]);
});

/*
  ADR 0009: no notion value is typed into this repo. asking for casefolded
  names and filtering on whatever notion spells them is what keeps a recased
  option from becoming a filter that matches nothing and reports success
*/
test("filters on notion's own spelling of each status, not ours", async () => {
  const fetchMock = notion({
    options: ["SECTION EDITED", "Managing edited", "scheduled"],
  });

  await upcomingArticles("token");

  expect(queryBody(fetchMock).filter).toEqual({
    or: [
      { property: "Article Status", status: { equals: "scheduled" } },
      { property: "Article Status", status: { equals: "Managing edited" } },
      { property: "Article Status", status: { equals: "SECTION EDITED" } },
    ],
  });
});

/* one renamed status loses its section, not the other two */
test("names a status notion no longer has, and still reads the rest", async () => {
  const fetchMock = notion({
    options: ["Scheduled", "Section Edited"],
    results: [page("p1", "Ready to go", "Scheduled", "2026-09-12")],
  });

  const found = await upcomingArticles("token");

  expect(found.missing).toEqual(["managing edited"]);
  expect(found.groups.map((group) => group.status)).toEqual([
    "Scheduled",
    "Section Edited",
  ]);
  expect(queryBody(fetchMock).filter.or).toHaveLength(2);
});

test("asks notion for nothing when it has none of the three", async () => {
  const fetchMock = notion({ options: ["Backlog", "Published"] });

  const found = await upcomingArticles("token");

  expect(found.groups).toEqual([]);
  expect(found.missing).toHaveLength(3);
  // and it does not go on to query for rows it cannot identify
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("reports that notion held more than one query returns", async () => {
  notion({
    results: [page("p1", "One", "Scheduled", "2026-09-12")],
    hasMore: true,
  });

  expect((await upcomingArticles("token")).truncated).toBe(true);
});

test("a full page notion has no more of is not truncated", async () => {
  notion({ results: [page("p1", "One", "Scheduled", "2026-09-12")] });

  expect((await upcomingArticles("token")).truncated).toBe(false);
});

test("orders each group by the day its articles publish", async () => {
  notion({
    results: [
      page("p1", "Later", "Scheduled", "2026-09-20"),
      page("p2", "Sooner", "Scheduled", "2026-09-12"),
    ],
  });

  const found = await upcomingArticles("token");

  expect(found.groups[0]!.articles.map((a) => a.headline)).toEqual([
    "Sooner",
    "Later",
  ]);
});

/*
  an Article can hold any of these statuses with no Publication Date — most
  section-edited ones do. dropping those would hide the ones that most need
  looking at, and putting them first would bury the schedule under them
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

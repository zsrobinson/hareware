import { expect, test } from "vitest";
import type { ArchiveArticle, Credit } from "./archive";
import {
  applyFilters,
  group,
  NO_FILTERS,
  people,
  periodBounds,
  periodOf,
} from "./stats";

/** a credit line; `bylines` are what it prints when the Sheet changes a name */
const credit = (
  role: Credit["role"],
  names: string[],
  bylines: (string | null)[] = names.map(() => null),
): Credit => ({
  role,
  label: role,
  printed: names.join(" and "),
  bylines: names.map((name, i) => bylines[i] ?? name),
  contributors: names.map((name, i) => ({
    name,
    byline: bylines[i] ?? null,
    source: bylines[i] ? "article" : "printed",
  })),
});

const article = (
  id: number,
  publishedAt: string,
  section: string,
  credits: Credit[],
): ArchiveArticle => ({
  id,
  title: `Post ${id}`,
  link: "",
  publishedAt,
  section,
  credits,
  problems: [],
});

const archive = [
  article(1, "2026-01-10T15:00:00Z", "News", [
    credit("writer", ["Ann"]),
    credit("image", ["Bo"]),
  ]),
  article(2, "2026-03-10T15:00:00Z", "News", [
    credit("writer", ["Ann", "Cy"]),
    credit("image", ["Ann"]),
  ]),
  article(3, "2026-09-10T15:00:00Z", "Sports", [
    credit("writer", ["Riley Real"], ["Penn Name"]),
  ]),
];

test("periods follow Eastern dates and UMD's terms", () => {
  /* 03:00Z on the 1st is still the evening before in Eastern */
  expect(periodOf("2026-05-31", "semester").label).toBe("Spring 2026");
  expect(periodOf("2026-08-01", "semester").label).toBe("Fall 2026");
  expect(periodOf("2026-01-01", "semester").label).toBe("Spring 2026");
  expect(
    applyFilters([article(9, "2026-09-01T03:00:00Z", "News", [])], {
      ...NO_FILTERS,
      from: "2026-09-01",
    }),
  ).toEqual([]);
});

test("articles by section count each article once", () => {
  const grouped = group(archive, {
    measure: "articles",
    by: "section",
    breakdown: "none",
    filters: NO_FILTERS,
  });
  expect(
    grouped.categories.map((c) => [c.label, grouped.values[c.key]!.all]),
  ).toEqual([
    ["News", 2],
    ["Sports", 1],
  ]);
});

test("a month with nothing published still has a column", () => {
  const grouped = group(archive, {
    measure: "articles",
    by: "month",
    breakdown: "none",
    filters: NO_FILTERS,
  });
  expect(grouped.categories.map((c) => c.label)).toEqual([
    "Jan 2026",
    "Feb 2026",
    "Mar 2026",
    "Apr 2026",
    "May 2026",
    "Jun 2026",
    "Jul 2026",
    "Aug 2026",
    "Sep 2026",
  ]);
  expect(grouped.values["2026-02"]).toBeUndefined();
});

test("contributions count a person once per role per article", () => {
  const all = group(archive, {
    measure: "contributions",
    by: "person",
    breakdown: "none",
    filters: NO_FILTERS,
  });
  /* wrote 1 and 2, and illustrated 2: three contributions on two articles */
  expect(all.values.Ann!.all).toBe(3);

  const writing = group(archive, {
    measure: "contributions",
    by: "person",
    breakdown: "none",
    filters: { ...NO_FILTERS, roles: ["writer"] },
  });
  expect(writing.values.Ann!.all).toBe(2);
  expect(writing.values.Bo).toBeUndefined();
});

test("grouping by person always counts contributions", () => {
  const grouped = group(archive, {
    measure: "articles",
    by: "person",
    breakdown: "none",
    filters: NO_FILTERS,
  });
  expect(grouped.measure).toBe("contributions");
  expect(grouped.values.Ann!.all).toBe(3);
});

test("people count contributions and remember the byline the Sheet resolved", () => {
  const rows = people(archive, NO_FILTERS);
  const ann = rows.find((row) => row.name === "Ann")!;
  expect(ann.contributions).toBe(3);
  expect(ann.counts).toEqual({ writer: 2, image: 1, other: 0 });

  const riley = rows.find((row) => row.name === "Riley Real")!;
  expect(riley.bylines).toEqual(["Penn Name"]);
  expect(rows.some((row) => row.name === "Penn Name")).toBe(false);
});

test("search ignores accents and curly quotes", () => {
  const found = applyFilters(
    [
      article(9, "2026-01-10T15:00:00Z", "News", [
        credit("writer", ["Emme Périal"]),
      ]),
    ],
    { ...NO_FILTERS, search: "perial" },
  );
  expect(found).toHaveLength(1);
});

test("summer belongs to Fall, so the semester axis has no near-empty summers", () => {
  expect(periodOf("2026-05-31", "semester").label).toBe("Spring 2026");
  expect(periodOf("2026-06-10", "semester").label).toBe("Fall 2026");
  expect(periodBounds("2026-2", "semester")).toEqual({
    from: "2026-06-01",
    to: "2026-12-31",
  });
  expect(periodBounds("2024-02", "month")).toEqual({
    from: "2024-02-01",
    to: "2024-02-29",
  });
});

test("a school year is a Fall and the Spring after it", () => {
  expect(periodOf("2025-09-10", "school-year")).toEqual({
    key: "2025",
    label: "2025–26",
  });
  expect(periodOf("2026-05-31", "school-year").key).toBe("2025");
  expect(periodBounds("2025", "school-year")).toEqual({
    from: "2025-06-01",
    to: "2026-05-31",
  });
  const grouped = group(archive, {
    measure: "articles",
    by: "school-year",
    breakdown: "none",
    filters: NO_FILTERS,
  });
  expect(grouped.categories.map((c) => c.label)).toEqual([
    "2025–26",
    "2026–27",
  ]);
  expect(grouped.totals).toEqual({ "2025": 2, "2026": 1 });
});

test("sections stack and list in the paper's order, not alphabetically", () => {
  const sections = ["Rabbithole", "Sports", "Entertainment", "News"].map(
    (section, i) => article(10 + i, "2026-01-10T15:00:00Z", section, []),
  );
  const grouped = group(sections, {
    measure: "articles",
    by: "semester",
    breakdown: "section",
    filters: NO_FILTERS,
  });
  expect(grouped.series.map((s) => s.key)).toEqual([
    "News",
    "Entertainment",
    "Sports",
    "Rabbithole",
  ]);

  const totals = group(sections, {
    measure: "articles",
    by: "section",
    breakdown: "none",
    filters: NO_FILTERS,
    order: "natural",
  });
  expect(totals.categories.map((c) => c.key)).toEqual([
    "News",
    "Entertainment",
    "Sports",
    "Rabbithole",
  ]);
});

test("the biggest are kept before a natural order sorts them", () => {
  const grouped = group(archive, {
    measure: "contributions",
    by: "person",
    breakdown: "none",
    filters: NO_FILTERS,
    limit: 2,
    order: "natural",
  });
  /* Ann has three, then Bo, Cy and Riley one each, of whom Bo is first by name */
  expect(grouped.categories.map((c) => c.key)).toEqual(["Ann", "Bo"]);
});

test("people count each name once, in a cell and in its total", () => {
  const grouped = group(archive, {
    measure: "people",
    by: "semester",
    breakdown: "role",
    filters: NO_FILTERS,
  });
  /* Spring: Ann wrote twice and illustrated once, Bo illustrated, Cy wrote */
  expect(grouped.values["2026-1"]).toEqual({ writer: 2, image: 2 });
  expect(grouped.totals["2026-1"]).toBe(3);
  expect(grouped.total).toBe(4);
});

test("a newcomer is counted where they first appear in the whole archive", () => {
  const options = {
    measure: "newcomers" as const,
    by: "semester" as const,
    breakdown: "none" as const,
    filters: { ...NO_FILTERS, from: "2026-03-01" },
  };
  const shown = applyFilters(archive, options.filters);
  /* from March, only Cy and Riley are new: Ann started in January */
  const grouped = group(shown, { ...options, history: archive });
  expect(grouped.totals).toEqual({ "2026-1": 1, "2026-2": 1 });
  expect(grouped.total).toBe(2);
});

test("a newcomer is new once, at their first contribution in any role", () => {
  /* Ann wrote in January and drew her first image in March */
  const options = {
    measure: "newcomers" as const,
    by: "semester" as const,
    breakdown: "role" as const,
    filters: { ...NO_FILTERS, roles: ["image" as const] },
    history: archive,
  };
  const grouped = group(applyFilters(archive, options.filters), options);
  /* Bo's first contribution was an image; Ann's was writing, so a filter
     to images does not make her new in March */
  expect(grouped.values["2026-1"]).toEqual({ image: 1 });
  expect(
    grouped.cells["2026-1"]!.image!.map((m) => m.units[0]!.person),
  ).toEqual(["Bo"]);
});

test("a running total carries through empty periods and counts a person once", () => {
  const articles = group(archive, {
    measure: "articles",
    by: "month",
    breakdown: "section",
    filters: NO_FILTERS,
    running: true,
  });
  expect(articles.values["2026-02"]).toEqual({ News: 1 });
  expect(articles.values["2026-09"]).toEqual({ News: 2, Sports: 1 });

  const people = group(archive, {
    measure: "people",
    by: "month",
    breakdown: "none",
    filters: NO_FILTERS,
    running: true,
  });
  /* Ann is in January and March; she is one of four people, not five */
  expect(people.totals["2026-03"]).toBe(3);
  expect(people.totals["2026-09"]).toBe(4);
});

test("an empty semester still has a column, so a gap is not hidden", () => {
  const grouped = group(
    [
      article(1, "2020-03-01T12:00:00Z", "News", []),
      article(2, "2021-09-01T12:00:00Z", "News", []),
    ],
    {
      measure: "articles",
      by: "semester",
      breakdown: "none",
      filters: NO_FILTERS,
    },
  );
  expect(grouped.categories.map((c) => c.label)).toEqual([
    "Spring 2020",
    "Fall 2020",
    "Spring 2021",
    "Fall 2021",
  ]);
});

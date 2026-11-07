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

const credit = (
  role: Credit["role"],
  names: string[],
  overridden = false,
  parsed = names,
): Credit => ({
  role,
  label: role,
  printed: parsed.join(" and "),
  names,
  parsed,
  overridden,
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
    credit("writer", ["Riley Real"], true, ["Penn Name"]),
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

test("credits by person count a co-author once each, and a role filter narrows them", () => {
  const all = group(archive, {
    measure: "credits",
    by: "person",
    breakdown: "none",
    filters: NO_FILTERS,
  });
  expect(all.values.Ann!.all).toBe(3);

  const writing = group(archive, {
    measure: "credits",
    by: "person",
    breakdown: "none",
    filters: { ...NO_FILTERS, roles: ["writer"] },
  });
  expect(writing.values.Ann!.all).toBe(2);
  expect(writing.values.Bo).toBeUndefined();
});

test("articles by person count an article once even when they did two jobs on it", () => {
  const grouped = group(archive, {
    measure: "articles",
    by: "person",
    breakdown: "none",
    filters: NO_FILTERS,
  });
  expect(grouped.values.Ann!.all).toBe(2);
});

test("people resolve through the Sheet and remember the pseudonym", () => {
  const [riley] = people(archive, NO_FILTERS).filter(
    (row) => row.name === "Riley Real",
  );
  expect(riley!.aliases).toEqual(["Penn Name"]);
  expect(
    people(archive, NO_FILTERS).some((row) => row.name === "Penn Name"),
  ).toBe(false);
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

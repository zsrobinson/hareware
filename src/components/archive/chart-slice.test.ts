import { expect, test } from "vitest";
import type { ArchiveArticle, Credit } from "~/lib/credits/archive";
import {
  applyFilters,
  easternDate,
  isPeriod,
  NO_FILTERS,
  periodOf,
  type Dimension,
  type Filters,
  type Grouped,
  type Member,
  type Unit,
} from "~/lib/credits/stats";
import {
  COUNTS,
  DRAWS,
  GROUPINGS,
  groupOf,
  ORDERS,
  settle,
  SPLITS,
  TOPS,
  VALUES,
  type ChartConfig,
} from "./chart-config";
import { readSlice, sliceCount, sliceKey, sliceMembers } from "./chart-slice";

/*
  A slice lists what its mark counts. These go through every chart the
  builder can make and check, for every mark, that the list is as long as
  the number drawn, and that everything on it belongs there.
*/

const credit = (role: Credit["role"], names: string[]): Credit => ({
  role,
  label: role,
  printed: names.join(" and "),
  bylines: names,
  contributors: names.map((name) => ({
    name,
    byline: null,
    source: "printed",
  })),
});

const post = (
  id: number,
  date: string,
  section: string,
  credits: Credit[],
): ArchiveArticle => ({
  id,
  title: `Invented headline ${id}`,
  link: "",
  publishedAt: `${date}T16:00:00Z`,
  section,
  credits,
  problems: [],
});

/* invented names; a dozen, so a top ten leaves people out */
const archive: ArchiveArticle[] = [
  post(1, "2025-09-04", "News", [
    credit("writer", ["Ada Example"]),
    credit("image", ["Bo Sample"]),
  ]),
  post(2, "2025-10-12", "Features", [
    credit("writer", ["Ada Example", "Cy Placeholder"]),
    /* the same person in two roles on one article: two contributions */
    credit("image", ["Ada Example"]),
  ]),
  post(3, "2025-11-20", "Sports", [credit("writer", ["Dee Invented"])]),
  post(4, "2026-01-15", "News", [
    credit("writer", ["Eli Madeup", "Fay Fictive"]),
    credit("other", ["Gus Notreal"]),
  ]),
  /* nobody credited */
  post(5, "2026-02-02", "Features", []),
  post(6, "2026-03-09", "Sports", [
    credit("writer", ["Ada Example"]),
    credit("image", ["Hal Pretend"]),
  ]),
  post(7, "2026-04-21", "News", [
    credit("writer", ["Ivy Imagined"]),
    credit("image", ["Bo Sample", "Jo Standin"]),
  ]),
  post(8, "2026-09-03", "Features", [
    credit("writer", ["Kit Dummy", "Lu Fakename"]),
    credit("image", ["Cy Placeholder"]),
  ]),
  post(9, "2026-10-08", "News", [
    credit("writer", ["Ada Example"]),
    credit("image", ["Mo Newname"]),
  ]),
  post(10, "2026-10-30", "Sports", [
    credit("writer", ["Kit Dummy"]),
    credit("other", ["Gus Notreal"]),
  ]),
];

/* every configuration the builder can make: what settle leaves as it is */
const configs: ChartConfig[] = COUNTS.flatMap(({ id: count }) =>
  GROUPINGS.flatMap(({ id: by }) =>
    SPLITS.flatMap(({ id: split }) =>
      DRAWS.flatMap((draw) =>
        VALUES.flatMap((values) =>
          ORDERS.flatMap((order) =>
            TOPS.map((top) => ({ count, by, split, draw, values, order, top })),
          ),
        ),
      ),
    ),
  ),
).filter((config) => {
  const settled = settle(config);
  return (Object.keys(config) as (keyof ChartConfig)[]).every(
    (key) => settled[key] === config[key],
  );
});

/* how a chart is drawn does not change what it counts, nor does an order or
   a top the builder does not offer for that grouping: one of each of the rest */
const counting = [
  ...new Map(
    configs.map((config) => [
      JSON.stringify([
        config.count,
        config.by,
        config.split,
        config.values,
        isPeriod(config.by) ? null : config.order,
        config.by === "person" ? config.top : null,
      ]),
      config,
    ]),
  ).values(),
];

const filterings: [string, Filters][] = [
  ["no filters", NO_FILTERS],
  ["images only", { ...NO_FILTERS, roles: ["image"] }],
  ["from January", { ...NO_FILTERS, from: "2026-01-01" }],
  ["two sections", { ...NO_FILTERS, sections: ["News", "Sports"] }],
];

/** whether a unit falls under a key of a dimension, worked out afresh */
function under(unit: Unit, dimension: Dimension, key: string, upTo: boolean) {
  if (dimension === "section") return unit.article.section === key;
  if (dimension === "role") return unit.role === key;
  if (dimension === "person") return unit.person === key;
  const period = periodOf(easternDate(unit.article.publishedAt), dimension).key;
  return upTo ? period <= key : period === key;
}

function check(grouped: Grouped, config: ChartConfig, filters: Filters) {
  const { measure } = grouped;
  const keys = grouped.series.map((s) => s.key);
  const hiddens = [[], ...keys.slice(0, 1).map((key) => [key])];

  for (const { key: category } of grouped.categories) {
    for (const series of keys) {
      const slice = { category, series };
      const members = sliceMembers(grouped, slice, []);
      /* as long as the segment it was opened from */
      expect(members.length).toBe(grouped.values[category]?.[series] ?? 0);
      expect(new Set(members.map((m) => m.id)).size).toBe(members.length);
      expect(readSlice(sliceKey(slice), grouped)).toEqual(slice);

      for (const member of members) {
        expect(member.units.length).toBeGreaterThan(0);
        for (const unit of member.units) {
          expect(under(unit, config.by, category, grouped.running)).toBe(true);
          if (config.split !== "none")
            expect(under(unit, config.split, series, false)).toBe(true);
          if (filters.roles.length > 0 && unit.role)
            expect(filters.roles).toContain(unit.role);
        }
        if (measure === "people")
          expect(member.units.every((u) => u.person === member.id)).toBe(true);
        else expect(member.units).toHaveLength(1);
      }
      if (measure === "newcomers")
        for (const { units } of members) {
          /* nobody credited before, anywhere in the archive */
          const first = units[0]!;
          const earlier = archive.filter(
            (a) => a.publishedAt < first.article.publishedAt,
          );
          expect(
            earlier.some((a) =>
              a.credits.some(
                (c) =>
                  (filters.roles.length === 0 ||
                    filters.roles.includes(c.role)) &&
                  c.contributors.some((p) => p.name === first.person),
              ),
            ),
          ).toBe(false);
        }
    }

    for (const hidden of hiddens) {
      const column = sliceMembers(grouped, { category, series: null }, hidden);
      /* as long as the column's total: the stack of the series the legend
         leaves on, or for people, the distinct people across every series */
      const drawn = keys.filter((key) => !hidden.includes(key));
      expect(column.length).toBe(
        measure === "people"
          ? (grouped.totals[category] ?? 0)
          : drawn.reduce(
              (sum, s) => sum + (grouped.values[category]?.[s] ?? 0),
              0,
            ),
      );
      if (hidden.length === 0)
        expect(column.length).toBe(grouped.totals[category] ?? 0);
    }
    expect(readSlice(category, grouped)).toEqual({ category, series: null });
  }
}

test("the builder makes charts of every kind, so all of them are checked", () => {
  /* a guard against the list above quietly shrinking to nothing */
  expect(configs.length).toBeGreaterThan(100);
  expect(new Set(configs.map((c) => c.count)).size).toBe(COUNTS.length);
  expect(new Set(configs.map((c) => c.values)).size).toBe(VALUES.length);
  expect(new Set(configs.map((c) => c.draw)).size).toBe(DRAWS.length);
  expect(counting.length).toBeGreaterThan(50);
});

test.each(filterings)(
  "every mark of every chart lists exactly what it counts, with %s",
  (_, filters) => {
    const shown = applyFilters(archive, filters);
    for (const config of counting) {
      const grouped = groupOf(config, shown, filters, archive);
      expect(grouped.categories.length, JSON.stringify(config)).toBeGreaterThan(
        0,
      );
      check(grouped, config, filters);
    }
  },
);

test("a top ten lists only the people it shows, each with all of theirs", () => {
  const config = configs.find(
    (c) => c.by === "person" && c.top === 10 && c.split === "role",
  )!;
  const grouped = groupOf(config, archive, NO_FILTERS, archive);
  expect(grouped.categories).toHaveLength(10);
  expect(grouped.available).toBeGreaterThan(10);
  /* Ada wrote four and illustrated one */
  const ada = sliceMembers(
    grouped,
    { category: "Ada Example", series: null },
    [],
  );
  expect(ada).toHaveLength(5);
  expect(
    sliceMembers(grouped, { category: "Ada Example", series: "writer" }, []),
  ).toHaveLength(4);
});

test("a person in two series is one of a column's people, with both", () => {
  const grouped = groupOf(
    {
      count: "people",
      by: "semester",
      split: "role",
      draw: "grouped",
      values: "number",
      order: "largest",
      top: 25,
    },
    archive,
    NO_FILTERS,
    archive,
  );
  /* Fall 2025: Ada wrote and illustrated */
  const column = sliceMembers(grouped, { category: "2025-2", series: null }, [
    "writer",
  ]);
  const ada = column.find((m) => m.id === "Ada Example")!;
  expect(ada.units.map((u) => u.role).sort()).toEqual([
    "image",
    "writer",
    "writer",
  ]);
  expect(column).toHaveLength(grouped.totals["2025-2"]!);
});

test("a running total's slice is everything up to its period", () => {
  const grouped = groupOf(
    {
      count: "articles",
      by: "semester",
      split: "section",
      draw: "stacked",
      values: "running",
      order: "largest",
      top: 25,
    },
    archive,
    NO_FILTERS,
    archive,
  );
  const news = sliceMembers(
    grouped,
    { category: "2026-1", series: "News" },
    [],
  );
  expect(news.map((m) => m.units[0]!.article.id).sort()).toEqual([1, 4, 7]);
});

test("a link to a mark the chart does not have opens nothing", () => {
  const grouped = groupOf(
    {
      count: "articles",
      by: "section",
      split: "none",
      draw: "stacked",
      values: "number",
      order: "natural",
      top: 25,
    },
    archive,
    NO_FILTERS,
    archive,
  );
  expect(readSlice("Rabbithole", grouped)).toBeNull();
  expect(readSlice("News~Sports", grouped)).toBeNull();
  expect(readSlice("News", grouped)).toEqual({
    category: "News",
    series: null,
  });
});

const members = (n: number, article = archive[0]!): Member[] =>
  Array.from({ length: n }, (_, id) => ({ id, units: [{ article }] }));

test("a slice's count says what it is of", () => {
  expect(sliceCount("articles", members(12))).toBe("12 articles");
  expect(sliceCount("articles", members(12), 40)).toBe(
    "12 of 40 articles · 30%",
  );
  /* the whole of a share is just its count */
  expect(sliceCount("articles", members(40), 40)).toBe("40 articles");
  expect(sliceCount("newcomers", members(1))).toBe("1 new person");
  expect(
    sliceCount("contributions", [
      { id: 0, units: [{ article: archive[0]!, role: "writer" }] },
      { id: 1, units: [{ article: archive[0]!, role: "image" }] },
      { id: 2, units: [{ article: archive[1]!, role: "writer" }] },
    ]),
  ).toBe("3 contributions on 2 articles");
});

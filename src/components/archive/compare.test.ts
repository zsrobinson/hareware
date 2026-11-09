import { expect, test } from "vitest";
import type { ArchiveArticle } from "~/lib/credits/archive";
import { contributionsOn } from "~/lib/credits/person";
import {
  applyFilters,
  easternDate,
  NO_FILTERS,
  type Filters,
  type Member,
} from "~/lib/credits/stats";
import {
  allows,
  COUNTS,
  GROUPINGS,
  groupOf,
  ORDERS,
  settle,
  TOPS,
  type ChartConfig,
} from "./chart-config";
import { sliceFilters, type SliceFilters } from "./chart-slice";
import { against, compared, stateFor, type Compare } from "./compare";
import { clearedState, type FilterState } from "./filters";
import { archive, credit, listed, onPeople, post } from "./invented-archive";
import { DIMENSIONS, settlePivot, type PivotConfig } from "./pivot-config";
import { differenceOf, pivotCount, pivotFilters, pivotOf } from "./pivot";

/*
  Compare sets what the range on screen counts beside the same count over
  an earlier range. These check the earlier range's dates, that each of
  the pair lists exactly what it counts on its own dates, and that a range
  with nothing to compare with is said, not drawn as zeros.
*/

const TODAY = "2026-11-09";
const days = (span: { from: string; to: string }) =>
  (Date.parse(span.to) - Date.parse(span.from)) / 86_400_000 + 1;

test("the period before is as long as the range so far, and ends the day before it", () => {
  /* Fall 2026, nine days into November */
  const fall = { from: "2026-06-01", to: "2026-12-31" };
  const before = against(fall, "previous", TODAY);
  expect(before).toEqual({
    status: "ready",
    now: { from: "2026-06-01", to: TODAY },
    then: { from: "2025-12-21", to: "2026-05-31" },
  });
  /* a year before is the same days, not the whole of that semester */
  expect(against(fall, "year-ago", TODAY)).toMatchObject({
    then: { from: "2025-06-01", to: "2025-11-09" },
  });

  /* a range that is over is set against one as long */
  const spring = { from: "2026-01-01", to: "2026-05-31" };
  const earlier = against(spring, "previous", TODAY);
  if (earlier.status !== "ready") throw new Error("not ready");
  expect(days(earlier.then)).toBe(days(spring));
  expect(earlier.then.to).toBe("2025-12-31");

  /* all time has nothing before it */
  expect(against({}, "previous", TODAY).status).toBe("unbounded");
  /* and a leap day a year back is the 28th */
  expect(
    against({ from: "2028-02-29", to: "2028-03-01" }, "year-ago", "2030-01-01"),
  ).toMatchObject({ then: { from: "2027-02-28", to: "2027-03-01" } });
});

/* Spring 2026, whose period before is Fall 2025's articles */
const SPRING: Filters = { ...NO_FILTERS, from: "2026-01-01", to: "2026-05-31" };
const SPRING_STATE: FilterState = {
  ...clearedState("custom"),
  from: "2026-01-01",
  to: "2026-05-31",
};

const day = (iso: string) => easternDate(iso);
const within = (date: string, span: { from: string; to: string }) =>
  date >= span.from && date <= span.to;

/* every chart the builder can make that compares */
const charts: ChartConfig[] = COUNTS.flatMap(({ id: count }) =>
  GROUPINGS.flatMap(({ id: by }) =>
    ORDERS.flatMap((order) =>
      TOPS.flatMap((top) =>
        (["previous", "year-ago"] as Compare[]).map((compare): ChartConfig => ({
          count,
          by,
          split: "none",
          draw: "grouped",
          values: "number",
          order,
          top,
          compare,
        })),
      ),
    ),
  ),
).filter((config) => JSON.stringify(settle(config)) === JSON.stringify(config));

test("a chart compares only where the pair reads true", () => {
  expect(charts.length).toBeGreaterThan(20);
  for (const config of charts) expect(allows(config).draw.stacked).toBe(false);
  const semester: ChartConfig = { ...charts[0]!, by: "semester" };
  /* across time, the axis is the comparison already */
  expect(allows(semester).compare.previous).toBe(false);
  expect(settle(semester).compare).toBe("none");
  /* and two ranges' shares or splits would add up to neither */
  expect(
    allows({ ...charts[0]!, compare: "none", values: "share" }).compare
      .previous,
  ).toBe(false);
  expect(
    allows({
      ...charts[0]!,
      compare: "none",
      split: "role",
      count: "contributions",
    }).compare.previous,
  ).toBe(false);
});

test("each of a chart's pair lists exactly what it counts, on its own dates", () => {
  const wrong: string[] = [];
  for (const config of charts.filter((c) => c.compare === "previous")) {
    const counting = (articles: typeof archive, on: Filters, whole: boolean) =>
      groupOf(whole ? { ...config, top: 0 } : config, articles, on, archive);
    const { grouped, ranges } = compared(
      counting,
      applyFilters(archive, SPRING),
      SPRING,
      archive,
      config.compare,
      { by: config.by, order: config.order },
      TODAY,
    );
    expect(ranges, JSON.stringify(config)).not.toBeNull();
    for (const { key: category } of grouped.categories)
      for (const series of ["now", "then"] as const) {
        const members = grouped.cells[category]?.[series] ?? [];
        expect(members.length).toBe(grouped.values[category]?.[series] ?? 0);
        const span = series === "now" ? ranges!.now : ranges!.then;
        for (const { units } of members)
          for (const unit of units)
            expect(within(day(unit.article.publishedAt), span)).toBe(true);
        if (members.length === 0) continue;
        /* as filters, the table on that range lists them */
        const seeing = sliceFilters(
          grouped,
          { by: config.by, split: "none" },
          { category, series: null },
          members,
          [],
          stateFor(SPRING_STATE, ranges, series),
        );
        const units = members.flatMap((m) => m.units);
        const table = listed(seeing.articles);
        const ok =
          grouped.measure === "newcomers"
            ? JSON.stringify([...seeing.people.people].sort()) ===
              JSON.stringify([...new Set(units.map((u) => u.person))].sort())
            : grouped.measure === "articles"
              ? JSON.stringify(table.articles) ===
                JSON.stringify(
                  [...new Set(units.map((u) => u.article.id))].sort(
                    (a, b) => a - b,
                  ),
                )
              : JSON.stringify(table.contributions) ===
                JSON.stringify(
                  units
                    .map((u) => `${u.article.id} ${u.role} ${u.person}`)
                    .sort(),
                );
        if (!ok) wrong.push(`${JSON.stringify(config)} ${category} ${series}`);
      }
  }
  expect(wrong).toEqual([]);
});

/* every pivot that compares */
const pivots: PivotConfig[] = COUNTS.flatMap(({ id: count }) =>
  DIMENSIONS.flatMap(({ id: rows }) =>
    (["number", "total"] as const).flatMap((values) =>
      (["previous", "year-ago"] as Compare[]).map((compare): PivotConfig => ({
        count,
        rows,
        columns: "none",
        values,
        top: 10,
        compare,
      })),
    ),
  ),
).filter(
  (config) => JSON.stringify(settlePivot(config)) === JSON.stringify(config),
);

test("each of a pivot's pair is its row on its own dates, and their difference", () => {
  expect(pivots.length).toBeGreaterThan(10);
  /* an intake or a period is a range of its own */
  expect(pivots.some((p) => p.rows === "joined" || p.rows === "semester")).toBe(
    false,
  );
  for (const config of pivots.filter((c) => c.compare === "previous")) {
    const pivot = pivotOf(
      config,
      applyFilters(archive, SPRING),
      SPRING,
      archive,
      TODAY,
    );
    expect(pivot.ranges, JSON.stringify(config)).not.toBeNull();
    expect(pivot.columns.map((c) => c.key)).toEqual(["now", "then"]);
    for (const row of [...pivot.rows.map((r) => r.key), null]) {
      for (const column of ["now", "then"]) {
        const span = column === "now" ? pivot.ranges!.now : pivot.ranges!.then;
        for (const { units } of pivot.members({ row, column }))
          for (const unit of units)
            expect(within(day(unit.article.publishedAt), span)).toBe(true);
      }
      const { by, points } = differenceOf(pivot, row);
      const now = pivot.count({ row, column: "now" });
      const then = pivot.count({ row, column: "then" });
      if (!points || row === null) expect(by).toBe(now - then);
      else
        expect(by).toBeCloseTo(
          pivot.share({ row, column: "now" })! -
            pivot.share({ row, column: "then" })!,
        );
      /* each range's shares are of its own total */
      if (config.values === "total" && row !== null)
        expect(pivot.share({ row, column: "then" })).toBeCloseTo(
          (then / pivot.count({ row: null, column: "then" })) * 100,
        );
      if (row !== null && then > 0) {
        const seeing = pivotFilters(
          pivot,
          { row, column: "then" },
          SPRING_STATE,
        );
        expect(seeing.articles).toMatchObject({
          preset: "custom",
          ...pivot.ranges!.then,
        });
      }
    }
  }
});

test("a range with nothing to compare with says so, and draws nothing for it", () => {
  const pivot = (filters: Filters, compare: Compare = "year-ago") =>
    pivotOf(
      {
        count: "articles",
        rows: "section",
        columns: "none",
        values: "number",
        top: 25,
        compare,
      },
      applyFilters(archive, filters),
      filters,
      archive,
      TODAY,
    );
  /* the archive starts in September 2025: Spring 2025 has nothing */
  const empty = pivot(SPRING);
  expect(empty.ranges).toBeNull();
  expect(empty.columns).toEqual([]);
  expect(empty.note).toMatch(/^Nothing from Spring 2025/);
  /* all time has nothing before it */
  expect(pivot(NO_FILTERS, "previous").note).toMatch(/^All time/);
  /* and a range the archive starts part way through is said to be short */
  const short = pivot(
    { ...NO_FILTERS, from: "2025-10-01", to: "2025-12-31" },
    "previous",
  );
  expect(short.ranges).not.toBeNull();
  expect(short.note).toMatch(/^The archive starts on Sep 4, 2025/);
  /* which the articles it has still count */
  expect(
    contributionsOn(archive[0]!).length > 0 &&
      short.count({ row: null, column: "then" }),
  ).toBe(1);
});

/* one person now, Old Example 0 among them, and fifteen before: more than
   a top ten, which the earlier range must not cut on its own */
const crowd = [
  post(100, "2026-03-01", "News", [
    credit("writer", ["Now Example"]),
    credit("image", ["Old Example 0"]),
  ]),
  ...Array.from({ length: 15 }, (_, i) =>
    post(
      i + 1,
      `2025-${String(9 + (i % 3)).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
      ["News", "Features", "Sports"][i % 3]!,
      [credit("writer", [`Old Example ${i}`])],
    ),
  ),
];

/**
 * Whether a slice, as filters, lists on both tables exactly what it
 * counts: its articles, and on People its people with its contributions.
 */
function exact(
  measure: string,
  members: Member[],
  seeing: SliceFilters,
  history: ArchiveArticle[],
) {
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  const units = members.flatMap((m) => m.units);
  const ids = [...new Set(units.map((u) => u.article.id))].sort(
    (a, b) => a - b,
  );
  const names = [...new Set(units.map((u) => u.person!))].sort();
  const credited = new Set(
    history.filter((a) => contributionsOn(a).length > 0).map((a) => a.id),
  );
  const table = listed(seeing.articles, history);
  const onTable = onPeople(seeing.people, history);
  if (measure === "newcomers")
    return (
      same(table.articles, ids) &&
      same(onTable.map((row) => row.name).sort(), names)
    );
  if (
    !same(
      table.articles.filter((id) => measure === "articles" || credited.has(id)),
      ids,
    )
  )
    return false;
  return (
    measure === "articles" ||
    (same(onTable.map((row) => row.name).sort(), names) &&
      onTable.reduce((n, row) => n + row.contributions, 0) === units.length &&
      same(
        table.contributions,
        units.map((u) => `${u.article.id} ${u.role} ${u.person}`).sort(),
      ))
  );
}

test("a top few is chosen once over both ranges, so each total is its list", () => {
  const config: PivotConfig = {
    count: "contributions",
    rows: "person",
    columns: "none",
    values: "number",
    top: 25,
    compare: "previous",
  };
  const shown = applyFilters(crowd, SPRING);
  const everyone = pivotOf(config, shown, SPRING, crowd, TODAY);
  const before = { row: null, column: "then" };
  /* everyone before, though the range on screen has two */
  expect(everyone.rows).toHaveLength(16);
  expect(everyone.count(before)).toBe(15);
  expect(differenceOf(everyone, null).by).toBe(2 - 15);
  const all = pivotFilters(everyone, before, SPRING_STATE);
  expect(onPeople(all.people, crowd)).toHaveLength(15);

  /* a top ten is the two now and the eight biggest before */
  const ten = pivotOf({ ...config, top: 10 }, shown, SPRING, crowd, TODAY);
  expect(ten.rows).toHaveLength(10);
  expect(pivotCount(ten)).toBe(
    "Top 10 of 16 people · 2 contributions, against 9",
  );
  expect(ten.count(before)).toBe(9);
  const some = pivotFilters(ten, before, SPRING_STATE);
  expect(onPeople(some.people, crowd)).toHaveLength(9);
  expect(exact("contributions", ten.members(before), some, crowd)).toBe(true);
});

test.each([
  ["the invented archive", archive],
  ["an earlier range bigger than the top few", crowd],
] as const)(
  "every compared cell, total and bar lists on both tables exactly what it counts, in %s",
  (_, history) => {
    const wrong: string[] = [];
    const shown = applyFilters([...history], SPRING);
    for (const config of pivots.filter((c) => c.compare === "previous")) {
      const pivot = pivotOf(config, shown, SPRING, [...history], TODAY);
      if (!pivot.ranges) continue;
      for (const row of [null, ...pivot.rows.map((r) => r.key)])
        for (const column of ["now", "then"]) {
          const slice = { row, column };
          const members = pivot.members(slice);
          if (members.length === 0) continue;
          const seeing = pivotFilters(pivot, slice, SPRING_STATE);
          if (!exact(pivot.grouped.measure, members, seeing, [...history]))
            wrong.push(`${JSON.stringify(config)} ${row} ${column}`);
        }
    }
    for (const config of charts.filter((c) => c.compare === "previous")) {
      const counting = (
        articles: ArchiveArticle[],
        on: Filters,
        whole: boolean,
      ) =>
        groupOf(whole ? { ...config, top: 0 } : config, articles, on, [
          ...history,
        ]);
      const { grouped, ranges } = compared(
        counting,
        shown,
        SPRING,
        [...history],
        config.compare,
        {
          by: config.by,
          order: config.order,
          limit: config.by === "person" ? config.top || undefined : undefined,
        },
        TODAY,
      );
      if (!ranges) continue;
      for (const { key: category } of grouped.categories)
        for (const series of ["now", "then"]) {
          const members = grouped.cells[category]?.[series] ?? [];
          if (members.length === 0) continue;
          const seeing = sliceFilters(
            grouped,
            { by: config.by, split: "none" },
            { category, series: null },
            members,
            [],
            stateFor(SPRING_STATE, ranges, series),
          );
          if (!exact(grouped.measure, members, seeing, [...history]))
            wrong.push(`${JSON.stringify(config)} ${category} ${series}`);
        }
    }
    expect(wrong).toEqual([]);
  },
);

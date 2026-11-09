import { expect, test } from "vitest";
import { toCsv } from "~/lib/csv";
import { contributionsOn } from "~/lib/credits/person";
import {
  applyFilters,
  easternDate,
  grainOf,
  NO_FILTERS,
  periodOf,
  type Dimension,
  type Filters,
  type Member,
  type Unit,
} from "~/lib/credits/stats";
import { COUNTS, TOPS } from "./chart-config";
import { clearedState } from "./filters";
import { archive, credit, listed, onPeople, post } from "./invented-archive";
import {
  DIMENSIONS,
  PIVOT_VALUES,
  settlePivot,
  type PivotConfig,
} from "./pivot-config";
import {
  cellValue,
  pivotCount,
  pivotFilters,
  pivotKey,
  pivotMatrix,
  pivotOf,
  readPivotSlice,
  toTsv,
  type Pivot,
  type PivotSlice,
} from "./pivot";
import { COMPARES } from "./compare";
import { VIEWS } from "./views";

/*
  A pivot's every number is the length of the list it opens. These go
  through every pivot the builder can make and check each cell and total:
  its list holds only what belongs under its row and column, a total is
  the cells it covers taken together, and the list, as filters, is what a
  table lists.
*/

const pivotOfView = (id: string) => {
  const { layout } = VIEWS.find((view) => view.id === id)!;
  if (layout.type !== "pivot") throw new Error(`${id} is not a pivot`);
  return layout.pivot;
};

/* every pivot the builder can make: what settlePivot leaves as it is */
const configs: PivotConfig[] = COUNTS.flatMap(({ id: count }) =>
  DIMENSIONS.flatMap(({ id: rows }) =>
    [{ id: "none" as const }, ...DIMENSIONS].flatMap(({ id: columns }) =>
      PIVOT_VALUES.flatMap(({ id: values }) =>
        TOPS.flatMap((top) =>
          COMPARES.map(({ id: compare }) => ({
            count,
            rows,
            columns,
            values,
            top,
            compare,
          })),
        ),
      ),
    ),
  ),
).filter((config) => {
  const settled = settlePivot(config);
  return (Object.keys(config) as (keyof PivotConfig)[]).every(
    (key) => settled[key] === config[key],
  );
});

/* values do not change what is counted, nor does a top without people;
   the first of each, which compares with nothing (compare.test has those) */
const counting = [
  ...new Map(
    configs
      .reverse()
      .map((config) => [
        JSON.stringify([
          config.count,
          config.rows,
          config.columns,
          [config.rows, config.columns].includes("person") ? config.top : null,
        ]),
        config,
      ]),
  ).values(),
];

/* the day of the earliest article anywhere that credits each person */
const firstOf = new Map(
  archive
    .flatMap((article) => contributionsOn(article))
    .map((c) => [c.person, easternDate(c.article.publishedAt)] as const)
    .sort(([, a], [, b]) => b.localeCompare(a)),
);

/* a day as the archive reads it, worked out once an article */
const days = new Map(
  archive.map((a) => [a.publishedAt, easternDate(a.publishedAt)]),
);

/** whether a unit falls under a key of a dimension, worked out afresh */
function under(
  unit: Unit,
  dimension: Dimension,
  key: string,
  grain = "semester",
) {
  if (dimension === "section") return unit.article.section === key;
  if (dimension === "role") return unit.role === key;
  if (dimension === "person") return unit.person === key;
  if (dimension === "joined")
    return (
      periodOf(firstOf.get(unit.person!)!, grain as "semester").key === key
    );
  return periodOf(days.get(unit.article.publishedAt)!, dimension).key === key;
}

const ids = (members: Member[]) => members.map((m) => m.id).sort();

/** every number the pivot shows, as the slice it opens */
function slicesOf(pivot: Pivot): PivotSlice[] {
  const rows = [null, ...pivot.rows.map((r) => r.key)];
  /* two ranges have no total across them */
  const columns = [
    ...(pivot.ranges ? [] : [null]),
    ...pivot.columns.map((c) => c.key),
  ];
  return rows.flatMap((row) => columns.map((column) => ({ row, column })));
}

function check(pivot: Pivot, filters: Filters) {
  const { config, grouped } = pivot;
  const grain = grainOf(config.rows, config.columns);
  const name = JSON.stringify(config);
  const rows = pivot.rows.map((r) => r.key);
  const columns = pivot.columns.map((c) => c.key);

  for (const slice of slicesOf(pivot)) {
    const members = pivot.members(slice);
    expect(pivot.count(slice), name).toBe(members.length);
    expect(new Set(ids(members)).size, name).toBe(members.length);
    expect(readPivotSlice(pivotKey(slice), pivot), name).toEqual(slice);
    for (const { units } of members)
      for (const unit of units) {
        if (slice.row !== null)
          expect(under(unit, config.rows, slice.row, grain), name).toBe(true);
        else
          expect(
            rows.some((row) => under(unit, config.rows, row, grain)),
            name,
          ).toBe(true);
        if (config.columns !== "none")
          if (slice.column !== null)
            expect(under(unit, config.columns, slice.column, grain), name).toBe(
              true,
            );
          else
            expect(
              columns.some((column) =>
                under(unit, config.columns as Dimension, column, grain),
              ),
              name,
            ).toBe(true);
        if (filters.roles.length > 0 && unit.role)
          expect(filters.roles).toContain(unit.role);
      }

    /* a total is what its cells hold together, each once */
    const covered: PivotSlice[] = (
      slice.row === null ? rows : [slice.row]
    ).flatMap((row): PivotSlice[] =>
      config.columns === "none"
        ? [{ row, column: null }]
        : (slice.column === null ? columns : [slice.column]).map((column) => ({
            row,
            column,
          })),
    );
    const cells = covered.map((cell) => ids(pivot.members(cell)));
    expect(ids(members), name).toEqual([...new Set(cells.flat())].sort());
    /* and their sum, unless it counts people, who can be in two of what it
       adds up, but never in two intakes */
    const summed = [
      slice.row === null ? config.rows : null,
      slice.column === null ? config.columns : null,
    ].filter((d) => d !== null && d !== "none");
    if (
      grouped.measure !== "people" ||
      summed.every((dimension) => dimension === "joined")
    )
      expect(members.length, name).toBe(
        cells.reduce((sum, cell) => sum + cell.length, 0),
      );

    const { share } = cellValue(pivot, slice);
    const base = pivot.base(slice);
    if (base && share !== null) {
      expect(pivot.share(slice)).toBeCloseTo(
        (members.length / pivot.count(base)) * 100,
      );
      expect(share).toBeLessThanOrEqual(100);
    }
    if (config.values === "number") expect(share).toBeNull();
  }
}

const filterings: [string, Filters][] = [
  ["no filters", NO_FILTERS],
  ["images only", { ...NO_FILTERS, roles: ["image"] }],
  ["from January", { ...NO_FILTERS, from: "2026-01-01" }],
  ["two sections", { ...NO_FILTERS, sections: ["News", "Sports"] }],
];

test("the builder makes pivots of every kind, so all of them are checked", () => {
  expect(configs.length).toBeGreaterThan(200);
  expect(new Set(configs.map((c) => c.rows)).size).toBe(DIMENSIONS.length);
  expect(new Set(configs.map((c) => c.values)).size).toBe(PIVOT_VALUES.length);
  for (const view of VIEWS)
    if (view.layout.type === "pivot")
      expect(configs).toContainEqual(view.layout.pivot);
});

/* one count at a time, each a test of its own size */
const byCount = filterings.flatMap(([name, filters]) =>
  COUNTS.map(({ id }) => [id, name, filters] as const),
);

test.each(byCount)(
  "every cell and total of every pivot lists exactly what it counts, counting %s, with %s",
  (count, _, filters) => {
    const shown = applyFilters(archive, filters);
    for (const config of counting.filter((c) => c.count === count)) {
      const pivot = pivotOf(config, shown, filters, archive);
      expect(pivot.rows.length, JSON.stringify(config)).toBeGreaterThan(0);
      check(pivot, filters);
    }
  },
);

test.each(COUNTS.map(({ id }) => id))(
  "every cell and total, as filters, lists on a table exactly what it counts, counting %s",
  (count) => {
    const state = clearedState("all");
    const credited = new Set(
      archive.filter((a) => contributionsOn(a).length > 0).map((a) => a.id),
    );
    const articleIds = (units: Unit[]) =>
      [...new Set(units.map((u) => u.article.id))].sort((a, b) => a - b);
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    const wrong: string[] = [];
    let checked = 0;
    for (const config of counting.filter((c) => c.count === count)) {
      /* a month is a semester's check again, a dozen times over */
      if (config.rows === "month" || config.columns === "month") continue;
      const pivot = pivotOf(config, archive, NO_FILTERS, archive);
      for (const slice of slicesOf(pivot)) {
        const members = pivot.members(slice);
        if (members.length === 0) continue;
        const units = members.flatMap((m) => m.units);
        const seeing = pivotFilters(pivot, slice, state);
        let ok: boolean;
        const names = [...new Set(units.map((u) => u.person!))].sort();
        if (pivot.grouped.measure === "newcomers")
          ok =
            same(listed(seeing.articles).articles, articleIds(units)) &&
            same(
              onPeople(seeing.people)
                .map((row) => row.name)
                .sort(),
              names,
            );
        else {
          const table = listed(seeing.articles);
          ok =
            same(
              table.articles.filter(
                (id) =>
                  pivot.grouped.measure === "articles" || credited.has(id),
              ),
              articleIds(units),
            ) &&
            (pivot.grouped.measure === "articles" ||
              /* and People has exactly its people, with exactly its contributions */
              (same(
                onPeople(seeing.people)
                  .map((row) => row.name)
                  .sort(),
                names,
              ) &&
                onPeople(seeing.people).reduce(
                  (n, row) => n + row.contributions,
                  0,
                ) === units.length &&
                same(
                  table.contributions,
                  units
                    .map((u) => `${u.article.id} ${u.role} ${u.person}`)
                    .sort(),
                )));
        }
        if (!ok) wrong.push(`${JSON.stringify(config)} ${pivotKey(slice)}`);
        checked++;
      }
    }
    expect(wrong).toEqual([]);
    expect(checked).toBeGreaterThan(100);
  },
);

test("Retention counts each intake's people in each semester they contributed", () => {
  const pivot = pivotOf(pivotOfView("retention"), archive, NO_FILTERS, archive);
  expect(pivot.rows.map((r) => r.label)).toEqual([
    "Fall 2025",
    "Spring 2026",
    "Fall 2026",
  ]);
  const cell = (row: string | null, column: string | null) =>
    ids(pivot.members({ row, column }));
  /* who started in Fall 2025, and which of them came back */
  expect(cell("2025-2", "2025-2")).toEqual([
    "Ada Example",
    "Bo Sample",
    "Cy Placeholder",
    "Dee Invented",
  ]);
  expect(cell("2025-2", "2026-1")).toEqual(["Ada Example", "Bo Sample"]);
  expect(cell("2025-2", "2026-2")).toEqual(["Ada Example", "Cy Placeholder"]);
  /* nobody contributes before they join */
  expect(cell("2026-1", "2025-2")).toEqual([]);
  expect(cell("2026-1", "2026-2")).toEqual(["Gus Notreal"]);
  /* each intake once in its total, and each semester's people once in theirs */
  expect(pivot.count({ row: "2025-2", column: null })).toBe(4);
  expect(pivot.count({ row: null, column: "2026-1" })).toBe(8);
  expect(pivot.count({ row: null, column: null })).toBe(13);

  /* a cell opens those people, in that semester */
  const seeing = pivotFilters(
    pivot,
    { row: "2025-2", column: "2026-1" },
    clearedState("all"),
  );
  expect([...seeing.people.people].sort()).toEqual([
    "Ada Example",
    "Bo Sample",
  ]);
  expect(seeing.people).toMatchObject({
    preset: "custom",
    from: "2026-01-01",
    to: "2026-05-31",
  });
});

test("an intake is someone's first contribution, whatever role the filters keep", () => {
  /* Bo drew in Fall 2025 and again in Spring 2026: still that intake */
  const filters = { ...NO_FILTERS, roles: ["image" as const] };
  const pivot = pivotOf(
    pivotOfView("retention"),
    applyFilters(archive, filters),
    filters,
    archive,
  );
  expect(ids(pivot.members({ row: "2025-2", column: "2026-1" }))).toEqual([
    "Bo Sample",
  ]);
  /* Cy wrote first, so drawing in Fall 2026 is not joining then */
  expect(ids(pivot.members({ row: "2026-2", column: "2026-2" }))).toEqual([
    "Mo Newname",
  ]);
});

test("Section share reads each section as a share of the articles, over their count", () => {
  const pivot = pivotOf(
    pivotOfView("section-share"),
    archive,
    NO_FILTERS,
    archive,
  );
  const read = (row: string | null) => cellValue(pivot, { row, column: null });
  expect(read("News")).toEqual({ count: 4, share: 40 });
  expect(read("Sports")).toEqual({ count: 3, share: 30 });
  /* the whole a share is of reads as its count */
  expect(read(null)).toEqual({ count: 10, share: null });
  expect(pivotMatrix(pivot)).toEqual([
    ["Section", "Articles"],
    ["News", "40.0%"],
    ["Features", "30.0%"],
    ["Sports", "30.0%"],
    ["Total", "10"],
  ]);
  expect(toTsv(pivotMatrix(pivot)).split("\n")[1]).toBe("News\t40.0%");
});

test("a pivot of people keeps the top few, and its totals are theirs", () => {
  const pivot = pivotOf(
    {
      count: "contributions",
      rows: "person",
      columns: "role",
      values: "number",
      top: 10,
      compare: "none",
    },
    archive,
    NO_FILTERS,
    archive,
  );
  expect(pivot.rows).toHaveLength(10);
  expect(pivotCount(pivot)).toBe(
    "Top 10 of 13 people · 18 of 21 contributions",
  );
  const shown = pivot.rows.map((r) => r.key);
  for (const { units } of pivot.members({ row: null, column: "writer" }))
    expect(shown).toContain(units[0]!.person);
  /* and as filters, only those people */
  const seeing = pivotFilters(
    pivot,
    { row: null, column: null },
    clearedState("all"),
  );
  expect([...seeing.articles.people].sort()).toEqual([...shown].sort());

  /* people as columns are cut the same way */
  const across = pivotOf(
    {
      count: "contributions",
      rows: "section",
      columns: "person",
      values: "number",
      top: 10,
      compare: "none",
    },
    archive,
    NO_FILTERS,
    archive,
  );
  expect(across.columns).toHaveLength(10);
  expect(pivotCount(across)).toBe(
    "Top 10 of 13 people · 18 of 21 contributions",
  );
});

test("a cell's link survives a name with the pivot's own marks in it", () => {
  const pivot = { rows: [{ key: "A~B*", label: "" }], columns: [] } as never;
  const slice = { row: "A~B*", column: null };
  expect(readPivotSlice(pivotKey(slice), pivot)).toEqual(slice);
  expect(readPivotSlice("A~B~C", pivot)).toBeNull();
  expect(readPivotSlice("Nobody~*", pivot)).toBeNull();
});

test("a copied or downloaded pivot reads every cell as text, a name like a formula too", () => {
  /* printed bylines are anyone's to write */
  const hostile = [
    post(1, "2026-03-01", "News", [credit("writer", ["=1+1"])]),
    post(2, "2026-03-02", "Sports", [credit("writer", [" -2+3"])]),
    post(3, "2026-03-03", "News", [credit("image", ["@SUM(A1)"])]),
  ];
  const config: PivotConfig = {
    count: "contributions",
    rows: "person",
    columns: "none",
    values: "number",
    top: 25,
    compare: "none",
  };
  const tsv = (pivot: Pivot) => toTsv(pivotMatrix(pivot)).split("\n");
  const byPerson = tsv(pivotOf(config, hostile, NO_FILTERS, hostile));
  expect(byPerson).toContain("'=1+1\t1");
  expect(byPerson).toContain("' -2+3\t1");
  /* and as columns */
  const across = tsv(
    pivotOf(
      { ...config, rows: "section", columns: "person" },
      hostile,
      NO_FILTERS,
      hostile,
    ),
  );
  expect([...across[0]!.split("\t")].sort()).toEqual(
    ["Section", "' -2+3", "'=1+1", "'@SUM(A1)", "Total"].sort(),
  );
  /* a CSV guards the same cells */
  const [header, ...body] = pivotMatrix(
    pivotOf(config, hostile, NO_FILTERS, hostile),
  );
  expect(toCsv(header!, body)).toContain("\r\n'=1+1,1\r\n");

  /* a difference that went up starts with a plus */
  const spring = { ...NO_FILTERS, from: "2026-01-01", to: "2026-05-31" };
  const compared = pivotOf(
    { ...config, count: "articles", rows: "section", compare: "previous" },
    applyFilters(archive, spring),
    spring,
    archive,
    "2026-11-09",
  );
  const rows = tsv(compared).map((line) => line.split("\t"));
  const differences = rows.slice(1).map((cells) => cells.at(-1)!);
  expect(differences.some((cell) => cell.startsWith("+"))).toBe(false);
  expect(differences.filter((cell) => cell.startsWith("'+"))).not.toEqual([]);
});

/*
  What a pivot counts and how its cells read, and what the options mean for
  one another, as ./chart-config is for a chart. A view (./views) declares
  one as its layout; ./view-state keeps the one on screen in the address.
*/

import {
  isPeriod,
  isQuantity,
  type Dimension,
  type Measure,
} from "~/lib/credits/stats";
import { COUNTS, GROUPINGS, TOPS } from "./chart-config";
import { COMPARES, type Compare } from "./compare";

/** a cell as a number, or as a share of its row, its column or everything */
export type PivotValues = "number" | "row" | "column" | "total";

export type PivotConfig = {
  count: Measure;
  rows: Dimension;
  /** "none" is one column, the rows' own counts */
  columns: Dimension | "none";
  values: PivotValues;
  /** where people are rows or columns, the biggest this many, or 0 for everyone */
  top: number;
  /** each row against an earlier range, as a pair of columns and their difference */
  compare: Compare;
};

export const DIMENSIONS: { id: Dimension; label: string }[] = [
  ...GROUPINGS,
  { id: "joined", label: "Joined in" },
];

/** "Joined in": a dimension as a header names it */
export const dimensionName = (id: string) =>
  DIMENSIONS.find((d) => d.id === id)?.label ?? id;

export const PIVOT_VALUES: { id: PivotValues; label: string }[] = [
  { id: "number", label: "Number" },
  { id: "row", label: "Share of each row" },
  { id: "column", label: "Share of each column" },
  { id: "total", label: "Share of the total" },
];

/**
 * What the options mean for one another, as the builder offers them: an
 * option that would have to change another is off until that one changes.
 */
export function allowsPivot({
  count,
  rows,
  columns,
  values,
  compare,
}: PivotConfig) {
  const axes: string[] = [rows, columns];
  const quantity = isQuantity(count);
  /* two ranges side by side are the columns, of rows that are not in time:
     an intake or a period is a range of its own. Views are lifetime views,
     which an earlier range has had longer to gather */
  const comparing = compare !== "none";
  const comparable =
    columns === "none" &&
    !isPeriod(rows) &&
    rows !== "joined" &&
    (values === "number" || values === "total") &&
    count !== "views";
  /* an article has no one role, person or intake; and by person, every
     person is one */
  const articles = !axes.some(
    (d) => d === "person" || d === "role" || d === "joined",
  );
  const people = !axes.includes("person");
  const axis = (id: Dimension, other: string) =>
    id !== other &&
    !(comparing && (isPeriod(id) || id === "joined")) &&
    (id === "person"
      ? count === "contributions" || quantity
      : id === "role"
        ? count !== "articles"
        : id === "joined"
          ? count !== "articles" && !quantity
          : true);
  const split = columns !== "none";
  /* an article credited in two roles, or to two people, is in both: shares
     of words across them add up past the whole they are taken of */
  const overlaps = (id: string) =>
    quantity && (id === "person" || id === "role");
  /* an intake is people's, not articles' */
  const ofArticles = !axes.includes("joined");
  return {
    count: {
      articles,
      contributions: true,
      people,
      newcomers: people,
      words: ofArticles,
      views: ofArticles && !comparing,
    } satisfies Record<Measure, boolean>,
    rows: Object.fromEntries(
      DIMENSIONS.map(({ id }) => [id, axis(id, columns)]),
    ) as Record<Dimension, boolean>,
    columns: {
      none: true,
      ...Object.fromEntries(
        DIMENSIONS.map(({ id }) => [id, axis(id, rows) && !comparing]),
      ),
    } as Record<Dimension | "none", boolean>,
    /* one column is its own row: a share of a row or a column is all of it */
    values: {
      number: true,
      row: split && !overlaps(columns),
      column: split && !overlaps(rows),
      total: !overlaps(rows) && !overlaps(columns),
    } satisfies Record<PivotValues, boolean>,
    top: axes.includes("person"),
    compare: Object.fromEntries(
      COMPARES.map(({ id }) => [id, id === "none" || comparable]),
    ) as Record<Compare, boolean>,
  };
}

/** the nearest pivot the builder could have made, so the url and the table never disagree */
export function settlePivot(config: PivotConfig): PivotConfig {
  const next = { ...config };
  if (next.columns === next.rows) next.columns = "none";
  if (!allowsPivot(next).count[next.count]) next.count = "contributions";
  if (!allowsPivot(next).values[next.values]) next.values = "number";
  if (!allowsPivot(next).compare[next.compare]) next.compare = "none";
  if (!TOPS.includes(next.top)) next.top = 25;
  return next;
}

const pick = <T extends string>(
  value: string | null,
  options: readonly T[],
  fallback: T,
): T => (options.includes(value as T) ? (value as T) : fallback);

const DIMENSION_IDS = DIMENSIONS.map((d) => d.id);

/** a pivot a link names, settled; a setting it leaves out is `fallback`'s */
export function readPivot(
  params: URLSearchParams,
  fallback: PivotConfig,
): PivotConfig {
  const d = fallback;
  const top = Number(params.get("top"));
  return settlePivot({
    count: pick(
      params.get("count"),
      COUNTS.map((c) => c.id),
      d.count,
    ),
    rows: pick(params.get("rows"), DIMENSION_IDS, d.rows),
    columns: pick(params.get("cols"), [...DIMENSION_IDS, "none"], d.columns),
    values: pick(
      params.get("values"),
      PIVOT_VALUES.map((v) => v.id),
      d.values,
    ),
    top: params.has("top") && TOPS.includes(top) ? top : d.top,
    compare: pick(
      params.get("compare"),
      COMPARES.map((c) => c.id),
      d.compare,
    ),
  });
}

/* each setting's name in a link; the table's own columns are `columns` */
const KEYS = {
  count: "count",
  rows: "rows",
  columns: "cols",
  values: "values",
  top: "top",
  compare: "compare",
} as const satisfies Record<keyof PivotConfig, string>;

/** writes a pivot into `params`, or takes one out (null) */
export function writePivot(pivot: PivotConfig | null, params: URLSearchParams) {
  for (const [setting, key] of Object.entries(KEYS))
    if (pivot) params.set(key, String(pivot[setting as keyof PivotConfig]));
    else params.delete(key);
}

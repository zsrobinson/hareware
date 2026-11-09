/*
  A pivot's cells and totals: rows by columns, each number the members it
  counts, as a chart's marks are (./chart-slice). A total is a slice with
  its row or column left open, so every number shown is the length of the
  list it opens, and the two cannot disagree.
*/

import type { ArchiveArticle } from "~/lib/credits/archive";
import { ROLE_NAMES, type Role } from "~/lib/credits/labels";
import { spreadsheetCell } from "~/lib/csv";
import {
  group,
  membersAcross,
  type Filters,
  type Grouped,
  type Member,
} from "~/lib/credits/stats";
import { COUNTS } from "./chart-config";
import {
  againstName,
  compared,
  signed,
  spanLabel,
  stateFor,
  type Compared,
} from "./compare";
import {
  counted,
  pairCount,
  sliceFilters,
  unitOf,
  type SliceFilters,
} from "./chart-slice";
import type { FilterState } from "./filters";
import { dimensionName, type PivotConfig } from "./pivot-config";

export type Header = { key: string; label: string };

/** one row and one column; null for every one shown, which makes a total */
export type PivotSlice = { row: string | null; column: string | null };

export type Pivot = {
  config: PivotConfig;
  grouped: Grouped;
  rows: Header[];
  /** none without columns: the rows' own counts are the one column */
  columns: Header[];
  /** how many there were before a top few cut them */
  available: { rows: number; columns: number };
  members: (slice: PivotSlice) => Member[];
  count: (slice: PivotSlice) => number;
  /** what a share is taken of, or null when cells are numbers */
  base: (slice: PivotSlice) => PivotSlice | null;
  /** the share as a percentage, or null when cells are numbers */
  share: (slice: PivotSlice) => number | null;
  /** the two ranges, when the columns are the range on screen and an earlier one */
  ranges: Compared["ranges"];
  /** what is said of the earlier range: why it is not drawn, or that it is short */
  note: string | null;
};

const ALL = "*";

/* a key may be a person's name, so the two halves are escaped */
const escape = (key: string | null) =>
  key === null
    ? ALL
    : key.replaceAll("%", "%25").replaceAll("~", "%7E").replaceAll("*", "%2A");

const unescape = (part: string) =>
  part === ALL ? null : decodeURIComponent(part);

/** "News~2026-1" for a cell, "News~*" for its row's total, "*~*" for everything */
export const pivotKey = ({ row, column }: PivotSlice) =>
  `${escape(row)}~${escape(column)}`;

export const sameSlice = (a: PivotSlice, b: PivotSlice) =>
  a.row === b.row && a.column === b.column;

/** the cell a key names in this pivot, or null when it has no such cell */
export function readPivotSlice(key: string, pivot: Pivot): PivotSlice | null {
  const parts = key.split("~");
  if (parts.length !== 2) return null;
  let slice: PivotSlice;
  try {
    slice = { row: unescape(parts[0]!), column: unescape(parts[1]!) };
  } catch {
    return null;
  }
  const row = slice.row === null || pivot.rows.some((r) => r.key === slice.row);
  /* two ranges have no total: their difference is no list */
  const column =
    (slice.column === null && !pivot.ranges) ||
    pivot.columns.some((c) => c.key === slice.column);
  return row && column ? slice : null;
}

const nameOf = (dimension: string, { key, label }: Header): Header => ({
  key,
  label: dimension === "role" ? (ROLE_NAMES[key as Role] ?? label) : label,
});

/** what a pivot counts, over the articles the filters left */
export function pivotOf(
  config: PivotConfig,
  shown: ArchiveArticle[],
  filters: Filters,
  /** the whole archive, where someone's first contribution is looked for */
  history: ArchiveArticle[],
  today?: string,
): Pivot {
  const { count, rows, columns, values, top, compare } = config;
  /* people the most first, as the top few are; anything else in its own order */
  const order = rows === "person" ? "largest" : "natural";
  const limit = rows === "person" ? top || undefined : undefined;
  const counting = (articles: ArchiveArticle[], on: Filters, whole = false) =>
    group(articles, {
      measure: count,
      by: rows,
      breakdown: columns,
      filters: on,
      order,
      limit: whole ? undefined : limit,
      history,
    });
  const { grouped, ranges, note } =
    compare === "none"
      ? { grouped: counting(shown, filters), ranges: null, note: null }
      : compared(
          counting,
          shown,
          filters,
          history,
          compare,
          { by: rows, order, limit },
          today,
        );
  const rowKeys = grouped.categories.map((c) => c.key);
  let shownColumns: Header[] = ranges
    ? [
        { key: "now", label: spanLabel(ranges.now) },
        { key: "then", label: spanLabel(ranges.then) },
      ]
    : columns === "none"
      ? []
      : grouped.series;
  if (columns === "person") {
    const sizes = new Map(
      grouped.series.map((s) => [
        s.key,
        membersAcross(grouped, rowKeys, [s.key]).length,
      ]),
    );
    shownColumns = [...shownColumns].sort(
      (a, b) =>
        sizes.get(b.key)! - sizes.get(a.key)! || a.label.localeCompare(b.label),
    );
    if (top) shownColumns = shownColumns.slice(0, top);
  }
  const columnKeys =
    columns === "none" && !ranges
      ? grouped.series.map((s) => s.key)
      : shownColumns.map((c) => c.key);

  const held = new Map<string, Member[]>();
  const members = (slice: PivotSlice) => {
    const key = pivotKey(slice);
    let list = held.get(key);
    if (!list) {
      list = membersAcross(
        grouped,
        slice.row === null ? rowKeys : [slice.row],
        slice.column === null ? columnKeys : [slice.column],
      );
      held.set(key, list);
    }
    return list;
  };
  const size = (slice: PivotSlice) => members(slice).length;
  const base = (slice: PivotSlice): PivotSlice | null =>
    values === "row"
      ? { row: slice.row, column: null }
      : values === "column"
        ? { row: null, column: slice.column }
        : values === "total"
          ? /* each range's share is of its own total */
            { row: null, column: ranges ? slice.column : null }
          : null;

  return {
    config,
    grouped,
    rows: grouped.categories.map((c) => nameOf(rows, c)),
    columns: ranges
      ? shownColumns
      : shownColumns.map((c) => nameOf(columns, c)),
    available: {
      rows: grouped.available,
      columns: columns === "none" ? 0 : grouped.series.length,
    },
    ranges,
    note,
    members,
    count: size,
    base,
    share: (slice) => {
      const whole = base(slice);
      if (!whole) return null;
      const of = size(whole);
      return of ? (size(slice) / of) * 100 : 0;
    },
  };
}

/** the people a top few left out of the columns, as a chart's legend hides series */
const hiddenOf = ({ grouped, columns, config, ranges }: Pivot) =>
  config.columns === "none" || ranges
    ? []
    : grouped.series
        .map((s) => s.key)
        .filter((key) => !columns.some((c) => c.key === key));

/** a cell as the filters each table would need to list it */
export const pivotFilters = (
  pivot: Pivot,
  slice: PivotSlice,
  state: FilterState,
): SliceFilters =>
  pivot.ranges
    ? /* a range's cell is its row, on that range's dates */
      sliceFilters(
        pivot.grouped,
        { by: pivot.config.rows, split: "none" },
        { category: slice.row, series: null },
        pivot.members(slice),
        [],
        stateFor(state, pivot.ranges, slice.column),
      )
    : sliceFilters(
        pivot.grouped,
        { by: pivot.config.rows, split: pivot.config.columns },
        { category: slice.row, series: slice.column },
        pivot.members(slice),
        hiddenOf(pivot),
        state,
      );

/** "People by joined in and semester", in the order the table reads */
export function pivotTitle({ config, grouped, ranges }: Pivot): string {
  const what = COUNTS.find((c) => c.id === grouped.measure)!.label;
  const by = dimensionName(config.rows).toLowerCase();
  const across =
    config.columns === "none"
      ? ""
      : ` and ${dimensionName(config.columns).toLowerCase()}`;
  const values =
    config.values === "row"
      ? ", as a share of each row"
      : config.values === "column"
        ? ", as a share of each column"
        : config.values === "total"
          ? ", as a share of the total"
          : "";
  const versus =
    ranges && config.compare !== "none"
      ? `, against ${againstName(config.compare)}`
      : "";
  return `${what} by ${by}${across}${values}${versus}`;
}

/** the pivot's count in words, of what it shows: "Top 25 of 60 people · 300 of 340 contributions" */
export function pivotCount(pivot: Pivot): string {
  const { grouped, available } = pivot;
  const unit = (n: number) =>
    grouped.measure === "people"
      ? counted(n, "person", "different people")
      : unitOf(n, grouped.measure);
  if (pivot.ranges) return pairCount(grouped);
  const shown = pivot.count({ row: null, column: null });
  const whole = membersAcross(
    grouped,
    Object.keys(grouped.cells),
    grouped.series.map((s) => s.key),
  ).length;
  const parts: string[] = [];
  /* only people are ever cut to a top few */
  if (pivot.rows.length < available.rows)
    parts.push(
      `Top ${pivot.rows.length} of ${counted(available.rows, "person", "people")}`,
    );
  if (
    pivot.config.columns !== "none" &&
    pivot.columns.length < available.columns
  )
    parts.push(
      `Top ${pivot.columns.length} of ${counted(available.columns, "person", "people")}`,
    );
  parts.push(
    shown === whole
      ? unit(whole)
      : `${shown.toLocaleString()} of ${unit(whole)}`,
  );
  return parts.join(" · ");
}

/** what a cell reads: its share, or a count where it is a number or the whole a share is of */
export function cellValue(
  pivot: Pivot,
  slice: PivotSlice,
): { count: number; share: number | null } {
  const base = pivot.base(slice);
  return {
    count: pivot.count(slice),
    share: base && !sameSlice(base, slice) ? pivot.share(slice) : null,
  };
}

/**
 * What a row of two ranges has changed by: in points where its cells are
 * shares, else in number.
 */
export function differenceOf(pivot: Pivot, row: string | null) {
  const [now, then] = ["now", "then"].map((column) =>
    cellValue(pivot, { row, column }),
  ) as [ReturnType<typeof cellValue>, ReturnType<typeof cellValue>];
  return now.share !== null && then.share !== null
    ? { by: now.share - then.share, points: true }
    : { by: now.count - then.count, points: false };
}

/** "+4", or for shares "+5 pts", to `digits` places of a point */
export function differenceText(pivot: Pivot, row: string | null, digits = 0) {
  const { by, points } = differenceOf(pivot, row);
  return signed(by, points, points ? digits : 0);
}

/**
 * The pivot as rows of text, as it reads: its header, a row each, and the
 * totals, for a CSV or a paste into a sheet. Shares keep one decimal.
 */
export function pivotMatrix(pivot: Pivot): string[][] {
  const text = (slice: PivotSlice) => {
    const { count, share } = cellValue(pivot, slice);
    return share === null ? String(count) : `${share.toFixed(1)}%`;
  };
  const split = pivot.config.columns !== "none";
  const measure = COUNTS.find((c) => c.id === pivot.grouped.measure)!.label;
  const header = [
    dimensionName(pivot.config.rows),
    ...pivot.columns.map((c) => c.label),
    pivot.ranges ? "Difference" : split ? "Total" : measure,
  ];
  const line = (row: string | null, label: string) => [
    label,
    ...pivot.columns.map((c) => text({ row, column: c.key })),
    pivot.ranges ? differenceText(pivot, row, 1) : text({ row, column: null }),
  ];
  return [
    header,
    ...pivot.rows.map((r) => line(r.key, r.label)),
    line(null, "Total"),
  ];
}

/** the matrix as a sheet takes a paste: tab between cells, a line a row,
    and every cell guarded as the CSV's are */
export const toTsv = (matrix: string[][]) =>
  matrix
    .map((row) =>
      row
        .map((cell) => spreadsheetCell(cell.replace(/[\t\r\n]+/g, " ")))
        .join("\t"),
    )
    .join("\n");

/*
  A pivot's cells and totals: rows by columns, each number the members it
  counts, as a chart's marks are (./chart-slice). A total is a slice with
  its row or column left open, so every number shown is what the list it
  opens comes to (`amountOf`), and the two cannot disagree.
*/

import type { ArchiveArticle } from "~/lib/credits/archive";
import { ROLE_NAMES, type Role } from "~/lib/credits/labels";
import { SECTION_ORDER, sortSections } from "~/lib/credits/sections";
import { spreadsheetCell } from "~/lib/csv";
import {
  amountOf,
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
  perArticle,
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
  /** nothing counted anywhere, though every section is a row of nothing */
  empty: boolean;
  members: (slice: PivotSlice) => Member[];
  /** what a cell's members come to: how many, or their words or views */
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
  /* every section the filters leave, whether or not it published: a
     share of none is a share, which a section left out would not say */
  const sectionsOf = (seen: Header[]): Header[] =>
    sortSections(
      new Set([
        ...(filters.sections.length > 0 ? filters.sections : SECTION_ORDER),
        ...seen.map((h) => h.key),
      ]),
    ).map((key) => seen.find((h) => h.key === key) ?? { key, label: key });
  const averageOf = (row: string) =>
    perArticle(
      membersAcross(
        grouped,
        [row],
        grouped.series.map((s) => s.key),
      ),
      count,
    );
  const ownHeaders =
    rows === "section" ? sectionsOf(grouped.categories) : grouped.categories;
  /* one column of averages answers which row is most per article, so its
     rows read in that order, the most first; a row with none counted last */
  const rowHeaders =
    values === "per-article" && columns === "none" && !ranges
      ? [...ownHeaders].sort(
          (a, b) => (averageOf(b.key) ?? -1) - (averageOf(a.key) ?? -1),
        )
      : ownHeaders;
  const rowKeys = rowHeaders.map((c) => c.key);
  let shownColumns: Header[] = ranges
    ? [
        { key: "now", label: spanLabel(ranges.now) },
        { key: "then", label: spanLabel(ranges.then) },
      ]
    : columns === "none"
      ? []
      : columns === "section"
        ? sectionsOf(grouped.series)
        : grouped.series;
  if (columns === "person") {
    const sizes = new Map(
      grouped.series.map((s) => [
        s.key,
        amountOf(membersAcross(grouped, rowKeys, [s.key]), count).value,
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
  const size = (slice: PivotSlice) =>
    amountOf(members(slice), grouped.measure).value;
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
    rows: rowHeaders.map((c) => nameOf(rows, c)),
    empty: !Object.values(grouped.cells).some((row) =>
      Object.values(row).some((list) => list.length > 0),
    ),
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
          : config.values === "per-article"
            ? ", per article"
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
  const whole = amountOf(
    membersAcross(
      grouped,
      Object.keys(grouped.cells),
      grouped.series.map((s) => s.key),
    ),
    grouped.measure,
  ).value;
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
  const { missing } = amountOf(
    pivot.members({ row: null, column: null }),
    grouped.measure,
  );
  if (missing > 0)
    parts.push(
      counted(missing, "article without views", "articles without views"),
    );
  return parts.join(" · ");
}

/**
 * What a cell reads: its share, or a count where it is a number or the
 * whole a share is of; per article, its words or views over the articles
 * it counted (null with none counted), beside the count it is of
 */
export function cellValue(
  pivot: Pivot,
  slice: PivotSlice,
): { count: number; share: number | null; average: number | null } {
  const base = pivot.base(slice);
  return {
    count: pivot.count(slice),
    share: base && !sameSlice(base, slice) ? pivot.share(slice) : null,
    average:
      pivot.config.values === "per-article"
        ? perArticle(pivot.members(slice), pivot.grouped.measure)
        : null,
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
 * totals, for a CSV or a paste into a sheet. Shares keep one decimal, and a
 * cell none of whose views could be read is blank, never 0.
 */
export function pivotMatrix(pivot: Pivot): string[][] {
  const text = (slice: PivotSlice) => {
    const { count, share, average } = cellValue(pivot, slice);
    const read = amountOf(pivot.members(slice), pivot.grouped.measure);
    if (read.counted === 0 && read.missing > 0) return "";
    if (pivot.config.values === "per-article" && split)
      return String(average ?? 0);
    return share === null ? String(count) : `${share.toFixed(1)}%`;
  };
  const split = pivot.config.columns !== "none";
  /* one column of sums: each, and what it is per article */
  const beside =
    pivot.config.values === "per-article" && !split && !pivot.ranges;
  const per = (row: string | null) =>
    beside
      ? [String(cellValue(pivot, { row, column: null }).average ?? "")]
      : [];
  const measure = COUNTS.find((c) => c.id === pivot.grouped.measure)!.label;
  /* a cell of averages says so in its header, as one standing alone must */
  const averaged = pivot.config.values === "per-article" && split;
  const named = (label: string) => (averaged ? `${label} per article` : label);
  const rows = [...pivot.rows.map((r) => r.key), null];
  /* a column of views some of whose articles have none read: their counts
     beside it, so a partial sum or average reads as one */
  const read = (slice: PivotSlice) =>
    amountOf(pivot.members(slice), pivot.grouped.measure);
  const companions = (label: string, column: string | null) =>
    pivot.grouped.measure === "views" &&
    rows.some((row) => read({ row, column }).missing > 0)
      ? {
          header: [
            `${label}: articles counted`,
            `${label}: articles without views`,
          ],
          cells: (row: string | null) => {
            const { counted, missing } = read({ row, column });
            return [String(counted), String(missing)];
          },
        }
      : null;
  const valueColumns = [
    ...pivot.columns.map((c) => ({
      label: c.label,
      cell: (row: string | null) => text({ row, column: c.key }),
      beside: companions(c.label, c.key),
    })),
    pivot.ranges
      ? {
          label: "Difference",
          cell: (row: string | null) => differenceText(pivot, row, 1),
          beside: null,
        }
      : {
          label: split ? "Total" : measure,
          cell: (row: string | null) => text({ row, column: null }),
          beside: companions(split ? "Total" : measure, null),
        },
  ];
  const header = [
    dimensionName(pivot.config.rows),
    ...valueColumns.flatMap((c) => [
      c.label === "Difference" ? c.label : named(c.label),
      ...(c.beside?.header ?? []),
    ]),
    ...(beside ? ["Per article"] : []),
  ];
  const line = (row: string | null, label: string) => [
    label,
    ...valueColumns.flatMap((c) => [
      c.cell(row),
      ...(c.beside?.cells(row) ?? []),
    ]),
    ...per(row),
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

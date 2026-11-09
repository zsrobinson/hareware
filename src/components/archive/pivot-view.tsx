import { ClipboardCopyIcon, DownloadIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CopyTextButton } from "~/components/copy-button";
import { Button } from "~/components/ui/button";
import { amountOf, applyFilters } from "~/lib/credits/stats";
import { toCsv } from "~/lib/csv";
import { saveFile } from "~/lib/save-file";
import { cn } from "~/lib/utils";
import type { ViewProps } from "./archive-shell";
import { COUNTS } from "./chart-config";
import {
  measureNote,
  percentText,
  perArticleText,
  sliceCount,
  unitOf,
} from "./chart-slice";
import {
  noneCounted,
  partialKeys,
  ViewsUnavailable,
  type Incomplete,
} from "./charts";
import { filtersFor } from "./compare";
import { RowDetails, type OpenRow } from "./open-row";
import { dimensionName, type PivotConfig } from "./pivot-config";
import {
  cellValue,
  differenceText,
  pivotCount,
  pivotFilters,
  pivotKey,
  pivotMatrix,
  pivotOf,
  pivotTitle,
  readPivotSlice,
  sameSlice,
  toTsv,
  type Header,
  type Pivot,
  type PivotSlice,
} from "./pivot";
import { SectionName } from "./section-name";
import { SlicePanel } from "./slice-panel";

export type PivotViewProps = ViewProps & {
  config: PivotConfig;
  /** what the view answers, under the title */
  question: string | null;
  /** the cell open beside the pivot, kept in the address as `?slice=` */
  opened: OpenRow;
  /** what a phone's Back from a cell says: the view it is on */
  back: string;
};

/** a pivot, and what any of its numbers counts */
export function PivotView({
  archive,
  filters,
  filterNote,
  filterState,
  config,
  question,
  opened,
  back,
}: PivotViewProps) {
  const shown = useMemo(
    () => applyFilters(archive.articles, filters),
    [archive, filters],
  );
  const pivot = useMemo(
    () => pivotOf(config, shown, filters, archive.articles),
    [config, shown, filters, archive],
  );
  const partial = useMemo(
    () => ({
      rows: partialKeys(pivot.rows, config.rows, filters),
      columns: partialKeys(pivot.columns, config.columns, filters),
    }),
    [pivot, config, filters],
  );

  const slice =
    opened.open === null ? null : readPivotSlice(opened.open, pivot);
  /* a link to a cell this pivot does not have, or one the filters emptied */
  const missing =
    opened.open !== null &&
    (slice === null || pivot.members(slice).length === 0);
  useEffect(() => {
    if (missing) opened.close();
  });
  /* the button a cell was opened from, which a row header and its total share */
  const opener = useRef<HTMLElement | null>(null);
  const open = (next: PivotSlice, from: HTMLElement) => {
    opener.current = from;
    opened.show(pivotKey(next));
  };

  if (config.count === "views" && archive.views.status !== "read")
    return <ViewsUnavailable views={archive.views} />;
  const unseen = noneCounted(
    pivot.grouped.measure,
    pivot.members({ row: null, column: null }),
  );
  if (unseen !== null)
    return <ViewsUnavailable views={archive.views} articles={unseen} />;
  const title = pivotTitle(pivot);
  const download = () => {
    const [header, ...body] = pivotMatrix(pivot);
    saveFile(
      /* the BOM makes excel read utf-8 */
      new Blob(["﻿", toCsv(header!, body)], {
        type: "text/csv;charset=utf-8",
      }),
      `pivot-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv",
    );
  };

  return (
    <div className="space-y-4">
      <figure className="space-y-3">
        <figcaption className="space-y-0.5">
          <div className="font-medium">{title}</div>
          {question && (
            <div className="text-muted-foreground text-sm">{question}</div>
          )}
          <div className="text-muted-foreground text-sm">
            {[
              pivotCount(pivot),
              filterNote,
              measureNote(pivot.grouped.measure, [config.rows, config.columns]),
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </figcaption>
        {pivot.note && (
          <p className="bg-muted/50 rounded-lg border px-3 py-2 text-sm">
            {pivot.note}
          </p>
        )}
        {pivot.empty ? (
          <p
            data-sheet-anchor
            className="text-muted-foreground py-12 text-center text-sm"
          >
            Nothing matches these filters.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="bg-background"
                onClick={download}
              >
                <DownloadIcon />
                Download CSV
              </Button>
              {/* tab-separated, which a sheet or a doc pastes as a table */}
              <CopyTextButton
                text={() => toTsv(pivotMatrix(pivot))}
                label="Copy table"
                what="the table, to paste into a sheet"
                icon={ClipboardCopyIcon}
                failed="Download the CSV instead."
              />
            </div>
            <PivotTable
              pivot={pivot}
              partial={partial}
              selected={slice}
              onOpen={open}
            />
          </>
        )}
      </figure>

      {slice && (
        <RowDetails>
          <SlicePanel
            key={pivotKey(slice)}
            title={sliceTitle(pivot, slice)}
            caption={[
              sliceCount(
                pivot.grouped.measure,
                pivot.members(slice),
                cellValue(pivot, slice).share === null
                  ? undefined
                  : pivot.count(pivot.base(slice)!),
              ),
              config.values === "per-article" &&
                perArticleText(pivot.members(slice), pivot.grouped.measure),
              /* the earlier range's dates are in the title, and are not the filters' */
              slice.column !== "then" && filterNote,
            ]
              .filter(Boolean)
              .join(" · ")}
            back={back}
            measure={pivot.grouped.measure}
            members={pivot.members(slice)}
            filters={filtersFor(filters, pivot.ranges, slice.column)}
            seeing={pivotFilters(pivot, slice, filterState)}
            onClose={opened.close}
            restoreFocus={() =>
              opener.current?.isConnected
                ? opener.current
                : document.querySelector<HTMLElement>(
                    `[data-pivot="${CSS.escape(pivotKey(slice))}"]`,
                  )
            }
          />
        </RowDetails>
      )}
    </div>
  );
}

/* an intake reads as one, so "Fall 2025" is never taken for the semester */
const headerTitle = (dimension: string, header: Header) =>
  dimension === "joined" ? `Joined ${header.label}` : header.label;

/** a cell's title ("Joined Fall 2025 · Spring 2026"), or its row's or column's for a total */
function sliceTitle({ config, rows, columns }: Pivot, slice: PivotSlice) {
  const row = rows.find((r) => r.key === slice.row);
  const column = columns.find((c) => c.key === slice.column);
  const parts = [
    row && headerTitle(config.rows, row),
    column && headerTitle(config.columns, column),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Total";
}

type Partial = {
  rows: Map<string, Incomplete>;
  columns: Map<string, Incomplete>;
};

/*
  The table: a header row, a row each with its total, and a row of totals.
  Every number is a button that opens what it counts, and so is every
  header, which opens its total. One tab stop for the table; arrows move
  between its buttons, as they do along a chart.
*/
function PivotTable({
  pivot,
  partial,
  selected,
  onOpen,
}: {
  pivot: Pivot;
  partial: Partial;
  selected: PivotSlice | null;
  onOpen: (slice: PivotSlice, from: HTMLElement) => void;
}) {
  const { config, rows, columns } = pivot;
  const split = config.columns !== "none";
  /* two ranges side by side: no totals across them, but their difference */
  const pairs = pivot.ranges !== null;
  /* one column of sums per article: each sum, and beside it what it is per
     article, which opens the same list as the sum */
  const beside = config.values === "per-article" && !split && !pairs;
  /* where each button is: a row, -1 for the header and rows.length for the
     totals; a column, -1 for the row's header and columns.length for its total */
  const last = { row: rows.length, column: columns.length };
  const [stop, setStop] = useState<string | null>(null);
  const table = useRef<HTMLTableElement>(null);

  /* every button, in reading order, for the one tab stop */
  const order: { at: string; slice: PivotSlice }[] = [];
  const add = (r: number, c: number, slice: PivotSlice) => {
    if (pivot.count(slice) > 0) order.push({ at: `${r},${c}`, slice });
  };
  columns.forEach((column, c) => add(-1, c, { row: null, column: column.key }));
  rows.forEach((row, r) => {
    if (!pairs) add(r, -1, { row: row.key, column: null });
    columns.forEach((column, c) =>
      add(r, c, { row: row.key, column: column.key }),
    );
    if (!pairs) add(r, last.column, { row: row.key, column: null });
  });
  columns.forEach((column, c) =>
    add(last.row, c, { row: null, column: column.key }),
  );
  if (!pairs) add(last.row, last.column, { row: null, column: null });
  const tabStop = order.some((o) => o.at === stop) ? stop : order[0]?.at;

  const move = (event: KeyboardEvent<HTMLTableElement>) => {
    const at = (event.target as HTMLElement).dataset.at;
    if (!at) return;
    const [r, c] = at.split(",").map(Number) as [number, number];
    const find = (row: number, column: number) =>
      table.current?.querySelector<HTMLElement>(`[data-at="${row},${column}"]`);
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    let target: HTMLElement | null | undefined = null;
    if (event.key === "Home" || event.key === "End") {
      const ends =
        event.key === "Home" ? [-1, last.column + 1, 1] : [last.column, -2, -1];
      for (let column = ends[0]!; column !== ends[1]; column += ends[2]!)
        if ((target = find(r, column))) break;
    } else if (steps[event.key]) {
      const [dr, dc] = steps[event.key]!;
      /* the next button that way, past any empty cell */
      for (
        let row = r + dr, column = c + dc;
        row >= -1 && row <= last.row && column >= -1 && column <= last.column;
        row += dr, column += dc
      )
        if ((target = find(row, column))) break;
    } else return;
    event.preventDefault();
    target?.focus();
  };

  const button = (
    r: number,
    c: number,
    slice: PivotSlice,
    name: string,
    content: ReactNode,
    className?: string,
  ) => {
    const { count, share, average } = cellValue(pivot, slice);
    if (pivot.members(slice).length === 0)
      return (
        <span className="text-muted-foreground/40 tabular-nums">
          {content ?? (share === null ? 0 : percentText(0))}
        </span>
      );
    /* articles none of whose views could be read: not a zero */
    const unread = amountOf(pivot.members(slice), pivot.grouped.measure);
    const none = unread.counted === 0 && unread.missing > 0;
    const at = `${r},${c}`;
    const open = selected !== null && sameSlice(selected, slice);
    const what =
      average === null || beside
        ? unitOf(count, pivot.grouped.measure)
        : `${unitOf(average, pivot.grouped.measure)} per article`;
    return (
      <button
        type="button"
        data-at={at}
        data-pivot={pivotKey(slice)}
        tabIndex={at === tabStop ? 0 : -1}
        aria-label={`${name}: ${share === null ? "" : `${percentText(share)}, `}see ${what}`}
        aria-current={open ? "true" : undefined}
        title={share === null ? undefined : what}
        onFocus={() => setStop(at)}
        onClick={(event) => onOpen(slice, event.currentTarget)}
        className={cn(
          "focus-visible:ring-ring/50 -mx-1 rounded-sm px-1 underline-offset-4 outline-none hover:underline focus-visible:ring-3",
          open && "bg-muted font-medium",
          className,
        )}
      >
        {content ??
          (none
            ? "–"
            : average !== null && !beside
              ? average.toLocaleString()
              : share === null
                ? count.toLocaleString()
                : percentText(share))}
      </button>
    );
  };

  /* a number that opens nothing: the sum beside it opens its list */
  const averageText = (slice: PivotSlice) => {
    const { average } = cellValue(pivot, slice);
    return average === null ? (
      <span className="text-muted-foreground/40">–</span>
    ) : (
      average.toLocaleString()
    );
  };

  const number = (r: number, c: number, slice: PivotSlice, name: string) =>
    button(r, c, slice, name, null, "tabular-nums");

  const label = (dimension: string, header: Header, part?: Incomplete) => (
    <>
      {dimension === "section" ? (
        <SectionName section={header.label} />
      ) : (
        header.label
      )}
      {part && <span className="text-muted-foreground"> ({part})</span>}
    </>
  );
  const rowName = (row: Header) => headerTitle(config.rows, row);
  const columnName = (column: Header) => headerTitle(config.columns, column);
  const cell = "px-3 py-2 text-right whitespace-nowrap";
  /* the rows' headers stay in view while the columns scroll under them */
  const sticky = "bg-background sticky left-0 z-[1] px-3 py-2 text-left";
  const measureName = COUNTS.find((c) => c.id === pivot.grouped.measure)!.label;

  return (
    /* a wide pivot scrolls inside its own box, never the page */
    <div className="max-w-full overflow-x-auto rounded-lg border">
      <table
        ref={table}
        onKeyDown={move}
        className="w-max min-w-full border-collapse text-sm"
      >
        <thead>
          <tr className="border-b">
            <th scope="col" className={cn(sticky, "font-medium")}>
              {dimensionName(config.rows)}
            </th>
            {columns.map((column, c) => (
              <th
                key={column.key}
                scope="col"
                className={cn(cell, "font-medium")}
              >
                {button(
                  -1,
                  c,
                  { row: null, column: column.key },
                  `${columnName(column)}, all`,
                  label(
                    config.columns,
                    column,
                    partial.columns.get(column.key),
                  ),
                )}
              </th>
            ))}
            <th scope="col" className={cn(cell, "font-medium")}>
              {pairs ? "Difference" : split ? "Total" : measureName}
            </th>
            {beside && (
              <th scope="col" className={cn(cell, "font-medium")}>
                Per article
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.key} className="hover:bg-muted/40 border-b">
              <th scope="row" className={cn(sticky, "font-normal")}>
                {pairs
                  ? label(config.rows, row)
                  : button(
                      r,
                      -1,
                      { row: row.key, column: null },
                      `${rowName(row)}, all`,
                      label(config.rows, row, partial.rows.get(row.key)),
                    )}
              </th>
              {columns.map((column, c) => (
                <td key={column.key} className={cell}>
                  {number(
                    r,
                    c,
                    { row: row.key, column: column.key },
                    `${rowName(row)}, ${columnName(column)}`,
                  )}
                </td>
              ))}
              <td className={cn(cell, split && "font-medium")}>
                {pairs ? (
                  <span className="tabular-nums">
                    {differenceText(pivot, row.key)}
                  </span>
                ) : (
                  number(
                    r,
                    last.column,
                    { row: row.key, column: null },
                    split ? `${rowName(row)}, total` : rowName(row),
                  )
                )}
              </td>
              {beside && (
                <td className={cn(cell, "tabular-nums")}>
                  {averageText({ row: row.key, column: null })}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <th scope="row" className={cn(sticky, "font-medium")}>
              Total
            </th>
            {columns.map((column, c) => (
              <td key={column.key} className={cell}>
                {number(
                  last.row,
                  c,
                  { row: null, column: column.key },
                  `Total, ${columnName(column)}`,
                )}
              </td>
            ))}
            <td className={cell}>
              {pairs ? (
                <span className="tabular-nums">
                  {differenceText(pivot, null)}
                </span>
              ) : (
                number(
                  last.row,
                  last.column,
                  { row: null, column: null },
                  "Total",
                )
              )}
            </td>
            {beside && (
              <td className={cn(cell, "tabular-nums")}>
                {averageText({ row: null, column: null })}
              </td>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

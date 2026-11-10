/*
  Compare: what the range on screen counts, against the same count over an
  earlier range of the same length, the one just before it or the same
  dates a year before. A range that runs to today is the part of it so far,
  so an unfinished semester is set against as many days, never a whole one.
*/

import type { ArchiveArticle } from "~/lib/credits/archive";
import {
  applyFilters,
  easternDate,
  paired,
  type Dimension,
  type Filters,
  type Grouped,
  type Order,
} from "~/lib/credits/stats";
import { formatDate } from "./dates";
import { periodNamed, type FilterState } from "./filters";

export type Compare = "none" | "previous" | "year-ago";

export const COMPARES: { id: Compare; label: string }[] = [
  { id: "none", label: "Nothing" },
  { id: "previous", label: "The period before" },
  { id: "year-ago", label: "A year before" },
];

/** inclusive `YYYY-MM-DD`, Eastern */
export type Span = { from: string; to: string };

export type Against =
  | { status: "none" }
  /** the range has no start, so there is nothing before it */
  | { status: "unbounded" }
  | { status: "ready"; now: Span; then: Span };

const DAY = 86_400_000;
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dateAt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/* a 29 February a year back is the 28th */
function yearBefore(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** the range on screen, so far, and the one it is compared with */
export function against(
  filters: Pick<Filters, "from" | "to">,
  compare: Compare,
  today: string,
): Against {
  if (compare === "none") return { status: "none" };
  if (!filters.from) return { status: "unbounded" };
  const end = filters.to && filters.to < today ? filters.to : today;
  const now = {
    from: filters.from,
    to: end < filters.from ? filters.from : end,
  };
  if (compare === "year-ago")
    return {
      status: "ready",
      now,
      then: { from: yearBefore(now.from), to: yearBefore(now.to) },
    };
  const days = (time(now.to) - time(now.from)) / DAY + 1;
  return {
    status: "ready",
    now,
    then: {
      from: dateAt(time(now.from) - days * DAY),
      to: dateAt(time(now.from) - DAY),
    },
  };
}

/** "Fall 2025", or "Jun 1, 2025 to Nov 9, 2025" */
export function spanLabel({ from, to }: Span): string {
  return periodNamed(from, to) ?? `${formatDate(from)} to ${formatDate(to)}`;
}

/**
 * What to say of the earlier range: that it has nothing to compare with,
 * so nothing is drawn for it, or that the archive starts part way through
 * it, so what it has is short. A range with nothing in it is never drawn
 * as zeros (see docs/agents/silent-failures.md).
 */
export function thenNote(
  state: Against,
  /** what the earlier range counts, on the filters */
  total: number,
  archive: readonly ArchiveArticle[],
): { draw: boolean; note: string | null } {
  if (state.status === "none") return { draw: false, note: null };
  if (state.status === "unbounded")
    return {
      draw: false,
      note: "All time has nothing before it to compare with: choose a range in Time.",
    };
  const then = spanLabel(state.then);
  if (total === 0)
    return {
      draw: false,
      note: `Nothing from ${then} matches these filters, so there is nothing to compare with.`,
    };
  const start = archive
    .map((article) => easternDate(article.publishedAt))
    .reduce((a, b) => (b < a ? b : a), "9999-12-31");
  return start > state.then.from
    ? {
        draw: true,
        note: `The archive starts on ${formatDate(start)}, part way through ${then}, so that range is short.`,
      }
    : { draw: true, note: null };
}

/** "the period before", as a title ends: "…, against the period before" */
export const againstName = (compare: Exclude<Compare, "none">) =>
  compare === "previous" ? "the period before" : "a year before";

/** what is on screen, and what it is set beside when there is one to draw */
export type Compared = {
  grouped: Grouped;
  /** the two ranges, when the earlier one is drawn beside the range on screen */
  ranges: { now: Span; then: Span } | null;
  /** what is said of the earlier range: why it is not drawn, or that it is short */
  note: string | null;
};

/**
 * A count over the range on screen, paired with the same count over the
 * earlier range when there is one to draw (`paired`): each category's
 * series are then `now` and `then`. `count` counts `whole`, without its top
 * few, so the pair can choose them once over both.
 */
export function compared(
  count: (
    articles: ArchiveArticle[],
    filters: Filters,
    whole: boolean,
  ) => Grouped,
  shown: ArchiveArticle[],
  filters: Filters,
  /** the whole archive, where the earlier range is read from */
  history: ArchiveArticle[],
  compare: Compare,
  options: { by: Dimension; order?: Order; limit?: number },
  today = easternDate(new Date().toISOString()),
): Compared {
  const state = against(filters, compare, today);
  if (state.status !== "ready")
    return {
      grouped: count(shown, filters, false),
      ranges: null,
      ...thenNote(state, 0, history),
    };
  const earlier = { ...filters, ...state.then };
  const then = count(applyFilters(history, earlier), earlier, true);
  const { draw, note } = thenNote(state, then.total, history);
  return draw
    ? {
        grouped: paired(count(shown, filters, true), then, options),
        ranges: { now: state.now, then: state.then },
        note,
      }
    : { grouped: count(shown, filters, false), ranges: null, note };
}

/** the filters a range of the two is counted on: the earlier one's dates, or the filters as they are */
export const filtersFor = <T extends { from?: string; to?: string }>(
  filters: T,
  ranges: Compared["ranges"],
  series: string | null,
): T =>
  ranges && series === "then" ? { ...filters, ...ranges.then } : filters;

/** a difference as it reads: "+4", "−4", or in points for shares, "+5 pts" */
export function signed(n: number, points = false, digits = 0): string {
  const rounded = Number(n.toFixed(digits));
  const size = Math.abs(rounded).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = rounded > 0 ? "+" : rounded < 0 ? "\u2212" : "";
  return `${sign}${size}${points ? " pts" : ""}`;
}

/** the filters as a table on one of the two ranges needs them */
export const stateFor = (
  state: FilterState,
  ranges: Compared["ranges"],
  series: string | null,
): FilterState =>
  ranges && series === "then"
    ? { ...state, preset: "custom", ...ranges.then }
    : state;

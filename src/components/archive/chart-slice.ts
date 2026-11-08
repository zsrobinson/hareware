/*
  A slice is what one mark of a chart counts: one series in a category (a
  segment, a bar), or the whole category (a column, a row). Its members come
  from the lists the chart's numbers are counted from (`membersOf`), and a
  column's total is the length of its slice, so what a slice lists is always
  as long as the number it was opened from.
*/

import {
  membersOf,
  type Grouped,
  type Measure,
  type Member,
} from "~/lib/credits/stats";

export type Slice = {
  category: string;
  /** null for the whole category */
  series: string | null;
};

const UNITS: Record<Measure, [string, string]> = {
  articles: ["article", "articles"],
  contributions: ["contribution", "contributions"],
  people: ["person", "people"],
  newcomers: ["new person", "new people"],
};

export const counted = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const unitOf = (n: number, measure: Measure) =>
  counted(n, ...UNITS[measure]);

export const percentText = (value: number) =>
  value > 0 && value < 1 ? "<1%" : `${Math.round(value)}%`;

/* a series key is a section, a role or "all", none of which has a tilde;
   the category before it may be a person's name, so the last one splits */
const MARK = "~";

/** "2026-2" for a column, "2026-2~News" for one series in it */
export const sliceKey = ({ category, series }: Slice) =>
  series === null ? category : `${category}${MARK}${series}`;

/** the slice a key names in this chart, or null when the chart has no such mark */
export function readSlice(key: string, grouped: Grouped): Slice | null {
  const shown = (category: string) =>
    grouped.categories.some((c) => c.key === category);
  const at = key.lastIndexOf(MARK);
  if (at > 0) {
    const category = key.slice(0, at);
    const series = key.slice(at + 1);
    if (shown(category) && grouped.series.some((s) => s.key === series))
      return { category, series };
  }
  return shown(key) ? { category: key, series: null } : null;
}

/**
 * The series a category's total adds up: those drawn. People are the
 * exception: one person in two series is one person in the total, which is
 * theirs whatever the legend hides.
 */
export function columnSeries(
  grouped: Grouped,
  hidden: readonly string[],
): string[] {
  const all = grouped.series.map((s) => s.key);
  return grouped.measure === "people"
    ? all
    : all.filter((key) => !hidden.includes(key));
}

/** what a slice counts, one member per thing counted */
export function sliceMembers(
  grouped: Grouped,
  slice: Slice,
  hidden: readonly string[],
): Member[] {
  return membersOf(
    grouped,
    slice.category,
    slice.series === null ? columnSeries(grouped, hidden) : [slice.series],
  );
}

/**
 * The slice's count in words: "12 articles", "18 contributions on 12
 * articles", or, on a chart of shares, "12 of 40 articles · 30%".
 */
export function sliceCount(
  measure: Measure,
  members: Member[],
  /** what a share is taken of, on a chart of shares */
  whole?: number,
): string {
  const n = members.length;
  if (whole !== undefined && whole !== n)
    return `${n.toLocaleString()} of ${unitOf(whole, measure)} · ${percentText(
      whole ? (n / whole) * 100 : 0,
    )}`;
  if (measure !== "contributions") return unitOf(n, measure);
  const articles = new Set(
    members.flatMap((m) => m.units.map((unit) => unit.article.id)),
  ).size;
  return `${unitOf(n, measure)} on ${counted(articles, "article", "articles")}`;
}

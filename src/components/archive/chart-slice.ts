/*
  A slice is what one mark of a chart counts: one series in a category (a
  segment, a bar), or the whole category (a column, a row). Its members come
  from the lists the chart's numbers are counted from (`membersOf`), and a
  column's total is the length of its slice, so what a slice lists is always
  as long as the number it was opened from.
*/

import {
  membersAcross,
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
 * What the chart draws, one member per thing counted: every category it
 * shows, in the series the legend leaves on. A person in two columns is one.
 */
export function drawnMembers(
  grouped: Grouped,
  hidden: readonly string[],
): Member[] {
  return membersAcross(
    grouped,
    grouped.categories.map((c) => c.key),
    grouped.series.map((s) => s.key).filter((key) => !hidden.includes(key)),
  );
}

/**
 * The chart's count in words, of what is drawn: "418 articles", "233 of 418
 * articles" with series hidden, "Top 25 of 33 people · 52 of 60
 * contributions", or "138 different people", which its columns add up to
 * more than.
 */
export function chartCount(grouped: Grouped, hidden: readonly string[]) {
  const unit = (n: number) =>
    grouped.measure === "people"
      ? counted(n, "person", "different people")
      : unitOf(n, grouped.measure);
  const drawn = drawnMembers(grouped, hidden).length;
  const whole = membersAcross(
    grouped,
    Object.keys(grouped.cells),
    grouped.series.map((s) => s.key),
  ).length;
  const parts: string[] = [];
  /* only grouping by person keeps the biggest few */
  if (grouped.categories.length < grouped.available)
    parts.push(
      `Top ${grouped.categories.length} of ${counted(grouped.available, "person", "people")}`,
    );
  parts.push(
    drawn === whole
      ? unit(whole)
      : `${drawn.toLocaleString()} of ${unit(whole)}`,
  );
  return parts.join(" · ");
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

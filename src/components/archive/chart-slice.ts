/*
  A slice is what one mark of a chart counts: one series in a category (a
  segment, a bar), or the whole category (a column, a row). Its members come
  from the lists the chart's numbers are counted from (`membersOf`), and a
  column's total is the length of its slice, so what a slice lists is always
  as long as the number it was opened from.
*/

import { isRole } from "~/lib/credits/labels";
import { contributionsOn } from "~/lib/credits/person";
import { COUNTED_SINCE } from "~/lib/services/wordpress/stats";
import {
  amountOf,
  easternDate,
  isCounted,
  isPeriod,
  isQuantity,
  membersAcross,
  membersOf,
  periodBounds,
  type Dimension,
  type Grouped,
  type Measure,
  type Member,
} from "~/lib/credits/stats";
import { rangeOf, toFilters, type FilterState } from "./filters";

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
  words: ["word", "words"],
  views: ["view", "views"],
};

export const counted = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const unitOf = (n: number, measure: Measure) =>
  counted(n, ...UNITS[measure]);

/* the day Jetpack began counting */
const COUNTED_FROM = `${COUNTED_SINCE}-01`;

/**
 * "1 article too new to count yet": the articles left out of a sum of
 * views, which a read that answered can only be for being newer than it.
 * Said last in a caption, after what it qualifies
 */
/**
 * A number's mark where some of its articles are too new to count: a faint
 * dagger whose title says how many, so the caveat in the caption is tied to
 * the numbers it qualifies. Null where all were counted, or none were
 */
export function tooNewMark(
  members: readonly Member[],
  measure: Measure,
): string | null {
  const { counted, missing } = amountOf(members, measure);
  return counted > 0 && missing > 0 ? tooNewText(members, measure) : null;
}

export const tooNewText = (members: readonly Member[], measure: Measure) => {
  const { missing } = amountOf(members, measure);
  return missing > 0
    ? counted(
        missing,
        "article too new to count yet",
        "articles too new to count yet",
      )
    : "";
};

/**
 * What words or views mean wherever they are counted, said once in a
 * caption as a search is: an article's words count once, however many
 * people it credits, and views are lifetime views of the articles the range
 * published. Nothing for a count
 */
export function measureNote(
  measure: Measure,
  dimensions: readonly string[],
  /** what is counted, whose earliest says whether counting's start matters */
  members: readonly Member[] = [],
): string {
  const people = dimensions.some((d) => d === "person" || d === "role");
  if (measure === "words")
    return people
      ? "Each article's words once, under everyone credited on it"
      : "";
  if (measure === "views") {
    /* only an article from before counting began has views it never got */
    const before = members.some(
      (m) => easternDate(m.units[0]!.article.publishedAt) < COUNTED_FROM,
    );
    return [
      `Lifetime views of the articles published in the range${
        before ? ", counted since January 2023" : ""
      }`,
      people && "each article once, under everyone credited on it",
    ]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

/**
 * Words or views per article: what a list comes to over the articles it
 * counted, to the nearest whole one, or null with none counted. Articles
 * without views are in neither half
 */
export function perArticle(
  members: readonly Member[],
  measure: Measure,
): number | null {
  const { value, counted } = amountOf(members, measure);
  return counted > 0 ? Math.round(value / counted) : null;
}

/** "468 words per article", or nothing where none was counted */
export function perArticleText(members: readonly Member[], measure: Measure) {
  const n = perArticle(members, measure);
  return n === null ? "" : `${unitOf(n, measure)} per article`;
}

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
 * theirs whatever the legend hides. Their intake is the one cut that
 * someone is never in two series of.
 */
export function columnSeries(
  grouped: Grouped,
  hidden: readonly string[],
): string[] {
  const all = grouped.series.map((s) => s.key);
  return grouped.measure === "people" && grouped.breakdown !== "joined"
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
  const drawn = amountOf(drawnMembers(grouped, hidden), grouped.measure).value;
  const whole = amountOf(
    membersAcross(
      grouped,
      Object.keys(grouped.cells),
      grouped.series.map((s) => s.key),
    ),
    grouped.measure,
  ).value;
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

/** two ranges' count in words: "64 articles, against 58", or of a top few, "Top 25 of 40 people · 60 contributions, against 75" */
export function pairCount(grouped: Grouped): string {
  const keys = grouped.categories.map((c) => c.key);
  const [now, then] = ["now", "then"].map(
    (series) =>
      amountOf(membersAcross(grouped, keys, [series]), grouped.measure).value,
  ) as [number, number];
  const pair = `${unitOf(now, grouped.measure)}, against ${then.toLocaleString()}`;
  /* only people are ever cut to a top few */
  return keys.length < grouped.available
    ? `Top ${keys.length} of ${counted(grouped.available, "person", "people")} · ${pair}`
    : pair;
}

/**
 * The slice's count in words: "12 articles", "18 contributions on 12
 * articles", "4,210 words on 9 articles", "980 views on 9 articles", or,
 * on a chart of shares, "12 of 40 articles · 30%". Articles too new to
 * count are said after it (`tooNewText`)
 */
export function sliceCount(
  measure: Measure,
  members: Member[],
  /** what a share is taken of, on a chart of shares */
  whole?: number,
): string {
  const { value: n, counted: on } = amountOf(members, measure);
  if (whole !== undefined && whole !== n)
    return `${n.toLocaleString()} of ${unitOf(whole, measure)} · ${percentText(
      whole ? (n / whole) * 100 : 0,
    )}`;
  if (isQuantity(measure))
    return `${unitOf(n, measure)} on ${counted(on, "article", "articles")}`;
  if (measure !== "contributions") return unitOf(n, measure);
  const articles = new Set(
    members.flatMap((m) => m.units.map((unit) => unit.article.id)),
  ).size;
  return `${unitOf(n, measure)} on ${counted(articles, "article", "articles")}`;
}

/** a slice as filters, for each table to list it */
export type SliceFilters = {
  articles: FilterState;
  people: FilterState;
  /** too many articles to name in a link: the tables have more than the mark */
  broader: boolean;
};

/** the most post ids a link names, about two kilobytes of address */
export const MOST_ARTICLES = 250;

/**
 * What a slice counts, as the filters a table would need to list it: a
 * period is the part of it the range covers, and a section, role or person
 * is that filter, so the table counts what the mark did (Articles lists an
 * article nobody is credited on too, which no count of people has).
 *
 * New people and an intake are not filters, and People's search is of
 * names, not of what an article prints. So where one of them picked what
 * the mark counts, the tables are given its articles by post id: with the
 * people, for new people or an intake; the articles found, for a search.
 * Past `MOST_ARTICLES` they are given the people by name, and `broader`
 * says so where that is more than the mark. A null category or series is
 * all of them that are shown: a pivot's totals.
 */
export function sliceFilters(
  grouped: Grouped,
  config: { by: Dimension; split: Dimension | "none" },
  slice: { category: string | null; series: string | null },
  members: Member[],
  hidden: readonly string[],
  state: FilterState,
  now = new Date(),
): SliceFilters {
  let next: FilterState = { ...state };
  /* an intake is no filter: its people are named */
  let intake = false;
  /* as the view cut it: a rolling range from its first whole period */
  const range = rangeOf(state, now, [config.by, config.split].find(isPeriod));
  /* the dates the slice's periods leave of the range, once one has */
  const dates = { cut: false, ...range };
  const later = (a: string, b?: string) => (b && b > a ? b : a);
  const earlier = (a: string, b?: string) => (b && b < a ? b : a);
  const narrow = (dimension: Dimension, keys: string[]) => {
    if (dimension === "section") next = { ...next, sections: keys };
    else if (dimension === "role")
      next = { ...next, roles: keys.filter(isRole) };
    else if (dimension === "person") next = { ...next, people: keys };
    else if (dimension === "joined") intake = true;
    else {
      const sorted = [...keys].sort();
      const from = periodBounds(sorted[0]!, dimension).from;
      const to = periodBounds(sorted.at(-1)!, dimension).to;
      /* a running total is everything up to the period */
      if (!grouped.running || dimension !== config.by)
        dates.from = later(from, dates.from);
      dates.to = earlier(to, dates.to);
      dates.cut = true;
    }
  };

  if (slice.category !== null) narrow(config.by, [slice.category]);
  else if (grouped.categories.length < grouped.available)
    /* the people a top few leaves */
    narrow(
      config.by,
      grouped.categories.map((c) => c.key),
    );

  if (config.split !== "none") {
    const keys =
      slice.series !== null ? [slice.series] : columnSeries(grouped, hidden);
    if (keys.length < grouped.series.length) narrow(config.split, keys);
  }
  if (dates.cut)
    next = { ...next, preset: "custom", from: dates.from, to: dates.to };

  const units = members.flatMap((m) => m.units);
  const ids = [...new Set(units.map((unit) => unit.article.id))].sort(
    (a, b) => a - b,
  );
  /* an article counted is everyone the filters count on it */
  const counted = isCounted(toFilters(state));
  const names = [
    ...new Set(
      units.flatMap((unit) =>
        unit.person
          ? [unit.person]
          : contributionsOn(unit.article)
              .filter(counted)
              .map((c) => c.person),
      ),
    ),
  ];
  const fits = ids.length <= MOST_ARTICLES;
  const chosen = { ...next, articles: ids, search: "" };
  const named = { ...next, people: names, search: "" };
  const newcomers = grouped.measure === "newcomers";
  const searched = Boolean(state.search.trim());
  return {
    /* Articles' own search reads a chart's as the chart did */
    articles: intake
      ? fits
        ? { ...chosen, people: names }
        : named
      : !newcomers
        ? next
        : fits
          ? chosen
          : named,
    people:
      (newcomers || intake) && fits
        ? { ...chosen, people: names }
        : newcomers || intake || searched
          ? fits
            ? chosen
            : named
          : next,
    /* an intake's people by name, on its dates, are exactly the mark */
    broader: !fits && (newcomers || searched),
  };
}

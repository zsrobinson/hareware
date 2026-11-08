/*
  Slicing the archive for the pages: filtering, grouping by period, section,
  role or person, and the people table. Pure, and shared by every view so a
  filter means the same thing on each.
*/

import type { ArchiveArticle } from "./archive";
import { ROLES, type Role } from "./labels";
import { compareSections } from "./sections";

export type Filters = {
  /** inclusive `YYYY-MM-DD`, Eastern; absent for open-ended */
  from?: string;
  to?: string;
  /** empty means every section */
  sections: string[];
  /** empty means every role */
  roles: Role[];
  /** a substring of a title or a credited name */
  search?: string;
};

export const NO_FILTERS: Filters = { sections: [], roles: [] };

export const PERIODS = ["month", "semester", "school-year", "year"] as const;
export type Period = (typeof PERIODS)[number];
export type Dimension = Period | "section" | "role" | "person";

export const isPeriod = (dimension: string): dimension is Period =>
  (PERIODS as readonly string[]).includes(dimension);

/**
 * What a chart adds up. An article counts once. A contribution is one person
 * in one role on one article, so someone who writes and illustrates an
 * article has made two. People are the distinct names behind the
 * contributions, so one person writing in two sections is one person in each
 * and still one in the total. A newcomer is a person counted once, where
 * their first contribution falls.
 */
export type Measure = "articles" | "contributions" | "people" | "newcomers";

const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` in Eastern */
export function easternDate(iso: string): string {
  return day.format(new Date(iso));
}

/** text as a search compares it: no case, accents or curly quotes */
export function searchable(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase();
}

export function applyFilters(
  articles: ArchiveArticle[],
  filters: Filters,
): ArchiveArticle[] {
  const search = filters.search?.trim()
    ? searchable(filters.search.trim())
    : "";

  return articles.filter((article) => {
    const date = easternDate(article.publishedAt);
    if (filters.from && date < filters.from) return false;
    if (filters.to && date > filters.to) return false;
    if (
      filters.sections.length > 0 &&
      !filters.sections.includes(article.section)
    )
      return false;
    if (search) {
      const haystack = searchable(
        [
          article.title,
          ...article.credits.flatMap((credit) => [
            credit.printed,
            ...credit.contributors.map((c) => c.name),
          ]),
        ].join(" "),
      );
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

/* Spring is January to May and Fall the rest of the year: the club barely
   publishes over the summer, and a near-empty Summer between two terms reads
   as a slump rather than a break */
function semesterOf(month: number) {
  return month <= 5 ? { order: 1, name: "Spring" } : { order: 2, name: "Fall" };
}

/** the first and last `YYYY-MM-DD` of the period a key names */
export function periodBounds(
  key: string,
  period: Period,
): { from: string; to: string } {
  const year = key.slice(0, 4);
  if (period === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (period === "school-year")
    return { from: `${year}-06-01`, to: `${Number(year) + 1}-05-31` };
  if (period === "month") {
    const [y, m] = key.split("-").map(Number) as [number, number];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
  }
  return key.endsWith("-1")
    ? { from: `${year}-01-01`, to: `${year}-05-31` }
    : { from: `${year}-06-01`, to: `${year}-12-31` };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** a sortable key and a label for the period a date falls in */
export function periodOf(
  date: string,
  period: Period,
): { key: string; label: string } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));

  if (period === "year") return { key: `${year}`, label: `${year}` };
  if (period === "school-year") {
    /* Fall and the Spring after it, keyed by the year it starts */
    const start = month <= 5 ? year - 1 : year;
    return {
      key: `${start}`,
      label: `${start}–${String(start + 1).slice(2)}`,
    };
  }
  if (period === "month")
    return { key: date.slice(0, 7), label: `${MONTHS[month - 1]} ${year}` };

  const semester = semesterOf(month);
  return {
    key: `${year}-${semester.order}`,
    label: `${semester.name} ${year}`,
  };
}

/** every period from the first key to the last, so an empty month still shows */
function fillPeriods(
  keys: string[],
  period: Period,
): { key: string; label: string }[] {
  if (keys.length === 0) return [];
  const sorted = [...keys].sort();
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  const out: { key: string; label: string }[] = [];

  let [year, step] = first.split("-").map(Number) as [
    number,
    number | undefined,
  ];
  const steps = period === "month" ? 12 : period === "semester" ? 2 : 1;
  const yearly = period === "year" || period === "school-year";

  for (let guard = 0; guard < 2000; guard++) {
    const key = yearly
      ? `${year}`
      : period === "month"
        ? `${year}-${String(step).padStart(2, "0")}`
        : `${year}-${step}`;
    const date = yearly
      ? `${year}-${period === "year" ? "01" : "06"}-01`
      : period === "month"
        ? `${key}-01`
        : `${year}-${String([1, 6][step! - 1]).padStart(2, "0")}-01`;
    out.push({ key, label: periodOf(date, period).label });
    if (key === last) break;

    if (yearly) year++;
    else if (step! >= steps) {
      year++;
      step = 1;
    } else step = step! + 1;
  }
  return out;
}

/** one countable thing: an article, or one person in one role on it */
type Unit = { article: ArchiveArticle; role?: Role; person?: string };

function contributions(articles: ArchiveArticle[], filters: Filters): Unit[] {
  const roles = filters.roles;
  const out: Unit[] = [];
  for (const article of articles) {
    const seen = new Set<string>();
    for (const credit of article.credits) {
      if (roles.length > 0 && !roles.includes(credit.role)) continue;
      for (const { name } of credit.contributors) {
        /* one person, one role, one article: one contribution */
        const key = `${credit.role}\u0000${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ article, role: credit.role, person: name });
      }
    }
  }
  return out;
}

function units(
  articles: ArchiveArticle[],
  measure: Measure,
  filters: Filters,
  history: ArchiveArticle[],
): Unit[] {
  const roles = filters.roles;

  if (measure === "articles")
    /* every article counts once; with a role picked, only those with a
       contribution in it */
    return articles
      .filter(
        (article) =>
          roles.length === 0 ||
          article.credits.some(
            (credit) =>
              roles.includes(credit.role) && credit.contributors.length > 0,
          ),
      )
      .map((article) => ({ article }));

  if (measure === "newcomers") {
    /* first in the whole archive, not in the filtered slice of it: a period
       filter must not make everyone in its first month new */
    const shown = new Set(articles.map((article) => article.id));
    const first = new Map<string, Unit>();
    const ordered = [...history].sort(
      (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
    );
    for (const unit of contributions(ordered, filters))
      if (!first.has(unit.person!)) first.set(unit.person!, unit);
    return [...first.values()].filter((unit) => shown.has(unit.article.id));
  }

  return contributions(articles, filters);
}

export type Grouped = {
  /** what was counted, which grouping by person or role can change */
  measure: Measure;
  categories: { key: string; label: string }[];
  series: { key: string; label: string }[];
  /** value[categoryKey][seriesKey] */
  values: Record<string, Record<string, number>>;
  /**
   * each category's own total. The sum of its values, except for people:
   * someone in two sections is one person in each and one in the total
   */
  totals: Record<string, number>;
  /** what was counted, across every category */
  total: number;
  /** distinct articles behind `total` */
  articles: number;
  /** how many categories there were before `limit` cut them */
  available: number;
};

export type Order = "largest" | "natural";

const ALL = "all";

/** a dimension's own order: the paper's sections, the roles as listed, else by name */
function naturalOrder(dimension: Dimension | "none") {
  return (
    a: { key: string; label: string },
    b: { key: string; label: string },
  ) =>
    isPeriod(dimension)
      ? a.key.localeCompare(b.key)
      : dimension === "section"
        ? compareSections(a.key, b.key)
        : dimension === "role"
          ? ROLES.indexOf(a.key as Role) - ROLES.indexOf(b.key as Role)
          : a.label.localeCompare(b.label);
}

export function group(
  articles: ArchiveArticle[],
  options: {
    measure: Measure;
    by: Dimension;
    breakdown: Dimension | "none";
    filters: Filters;
    /** for a category, the biggest first (the default) or the dimension's own order */
    order?: Order;
    /** the biggest this many categories; periods are never cut */
    limit?: number;
    /** each period as everything up to and including it */
    running?: boolean;
    /** the whole archive, where a newcomer's first contribution is looked for */
    history?: ArchiveArticle[];
  },
): Grouped {
  const { by, breakdown, filters } = options;
  const touchesPeople = [by, breakdown].some(
    (d) => d === "person" || d === "role",
  );
  /* an article has no one role or person, so those count contributions; and
     by person, every person would be one person */
  const measure: Measure =
    options.measure === "articles" && touchesPeople
      ? "contributions"
      : options.measure !== "articles" && by === "person"
        ? "contributions"
        : options.measure;
  const list = units(articles, measure, filters, options.history ?? articles);

  const keyOf = (
    unit: Unit,
    dimension: Dimension,
  ): { key: string; label: string } => {
    switch (dimension) {
      case "section":
        return { key: unit.article.section, label: unit.article.section };
      case "role":
        return { key: unit.role ?? "?", label: unit.role ?? "?" };
      case "person":
        return { key: unit.person ?? "?", label: unit.person ?? "?" };
      default:
        return periodOf(easternDate(unit.article.publishedAt), dimension);
    }
  };

  /* what makes two units one: the same person, when people are counted */
  const identity = (unit: Unit, index: number): string | number =>
    measure === "people" ? unit.person! : index;

  const cells = new Map<string, Map<string, Set<string | number>>>();
  const categoryLabels = new Map<string, string>();
  const seriesLabels = new Map<string, string>();

  list.forEach((unit, index) => {
    const category = keyOf(unit, by);
    const series =
      breakdown === "none"
        ? { key: ALL, label: measure }
        : keyOf(unit, breakdown);
    categoryLabels.set(category.key, category.label);
    seriesLabels.set(series.key, series.label);
    const row = cells.get(category.key) ?? new Map();
    cells.set(category.key, row);
    const cell = row.get(series.key) ?? new Set();
    row.set(series.key, cell);
    cell.add(identity(unit, index));
  });

  const sizes = new Map(
    [...cells].map(([key, row]) => [
      key,
      new Set([...row.values()].flatMap((cell) => [...cell])).size,
    ]),
  );
  const sizeOf = (key: string) => sizes.get(key) ?? 0;

  let categories: { key: string; label: string }[];
  if (isPeriod(by)) {
    categories = fillPeriods([...categoryLabels.keys()], by);
  } else {
    categories = [...categoryLabels].map(([key, label]) => ({ key, label }));
    categories.sort(
      (a, b) => sizeOf(b.key) - sizeOf(a.key) || a.label.localeCompare(b.label),
    );
    if (options.limit) categories = categories.slice(0, options.limit);
    if (options.order === "natural") categories.sort(naturalOrder(by));
  }

  const values: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  if (options.running && isPeriod(by)) {
    /* a running union rather than a running sum, so a person is counted once
       however many periods they appear in */
    const sofar = new Map<string, Set<string | number>>();
    const everyone = new Set<string | number>();
    for (const { key } of categories) {
      for (const [series, cell] of cells.get(key) ?? []) {
        const seen = sofar.get(series) ?? new Set();
        sofar.set(series, seen);
        for (const id of cell) {
          seen.add(id);
          everyone.add(id);
        }
      }
      if (everyone.size === 0) continue;
      values[key] = Object.fromEntries(
        [...sofar].map(([series, seen]) => [series, seen.size]),
      );
      totals[key] = everyone.size;
    }
  } else {
    for (const [key, row] of cells) {
      values[key] = Object.fromEntries(
        [...row].map(([series, cell]) => [series, cell.size]),
      );
      totals[key] = sizeOf(key);
    }
  }

  const series = [...seriesLabels].map(([key, label]) => ({ key, label }));
  series.sort(naturalOrder(breakdown));

  return {
    measure,
    categories,
    series,
    values,
    totals,
    total: new Set(list.map(identity)).size,
    articles: new Set(list.map((unit) => unit.article.id)).size,
    available: categoryLabels.size,
  };
}

export type PersonRow = {
  name: string;
  /** contributions per role */
  counts: Record<Role, number>;
  contributions: number;
  first: string;
  last: string;
  /** printed bylines the Sheet counts as this person */
  bylines: string[];
  articleIds: number[];
};

export function people(
  articles: ArchiveArticle[],
  filters: Filters,
): PersonRow[] {
  const rows = new Map<string, PersonRow>();

  for (const article of articles) {
    const date = easternDate(article.publishedAt);
    for (const credit of article.credits) {
      if (filters.roles.length > 0 && !filters.roles.includes(credit.role))
        continue;
      const counted = new Set<string>();
      for (const contributor of credit.contributors) {
        const { name } = contributor;
        if (counted.has(name)) continue;
        counted.add(name);
        const row =
          rows.get(name) ??
          ({
            name,
            counts: { writer: 0, image: 0, other: 0 },
            contributions: 0,
            first: date,
            last: date,
            bylines: [],
            articleIds: [],
          } satisfies PersonRow);
        row.counts[credit.role]++;
        row.contributions++;
        if (!row.articleIds.includes(article.id))
          row.articleIds.push(article.id);
        if (date < row.first) row.first = date;
        if (date > row.last) row.last = date;
        if (contributor.byline && !row.bylines.includes(contributor.byline))
          row.bylines.push(contributor.byline);
        rows.set(name, row);
      }
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.contributions - a.contributions || a.name.localeCompare(b.name),
  );
}

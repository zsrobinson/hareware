/*
  Slicing the archive for the pages: filtering, grouping by period, section,
  role or person, and the people table. Pure, and shared by every view so a
  filter means the same thing on each.
*/

import type { ArchiveArticle } from "./archive";
import type { Role } from "./labels";

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

export type Period = "month" | "semester" | "year";
export type Dimension = Period | "section" | "role" | "person";
export type Measure = "articles" | "credits";

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

export function applyFilters(
  articles: ArchiveArticle[],
  filters: Filters,
): ArchiveArticle[] {
  const search = filters.search?.trim().toLowerCase();

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
      const haystack = [
        article.title,
        ...article.credits.flatMap((credit) => [
          credit.printed,
          ...credit.names,
        ]),
      ]
        .join(" ")
        .toLowerCase();
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

  for (let guard = 0; guard < 2000; guard++) {
    const key =
      period === "year"
        ? `${year}`
        : period === "month"
          ? `${year}-${String(step).padStart(2, "0")}`
          : `${year}-${step}`;
    const date =
      period === "year"
        ? `${year}-01-01`
        : period === "month"
          ? `${key}-01`
          : `${year}-${String([1, 6][step! - 1]).padStart(2, "0")}-01`;
    out.push({ key, label: periodOf(date, period).label });
    if (key === last) break;

    if (period === "year") year++;
    else if (step! >= steps) {
      year++;
      step = 1;
    } else step = step! + 1;
  }
  return out;
}

/** one countable thing: an article, or one person credited in one role on it */
type Unit = { article: ArchiveArticle; role?: Role; person?: string };

function units(
  articles: ArchiveArticle[],
  measure: Measure,
  filters: Filters,
  needsPeople: boolean,
): Unit[] {
  const roles = filters.roles;
  if (measure === "articles" && !needsPeople) {
    /* an article counts once, and only if it has a credit in a chosen role */
    return articles
      .filter(
        (article) =>
          roles.length === 0 ||
          article.credits.some((credit) => roles.includes(credit.role)),
      )
      .map((article) => ({ article }));
  }

  const out: Unit[] = [];
  for (const article of articles) {
    const seen = new Set<string>();
    for (const credit of article.credits) {
      if (roles.length > 0 && !roles.includes(credit.role)) continue;
      for (const person of credit.names) {
        /* one person, one role, one article: counted once */
        const key = `${credit.role}\u0000${person}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ article, role: credit.role, person });
      }
    }
  }

  if (measure === "articles") {
    /* grouped by person: each article once per person, whatever their roles */
    const once = new Map<string, Unit>();
    for (const unit of out)
      once.set(`${unit.article.id}\u0000${unit.person}`, {
        ...unit,
        role: undefined,
      });
    return [...once.values()];
  }
  return out;
}

export type Grouped = {
  categories: { key: string; label: string }[];
  series: { key: string; label: string }[];
  /** value[categoryKey][seriesKey] */
  values: Record<string, Record<string, number>>;
  /** units counted: articles, or one per person per role per article */
  total: number;
  /** distinct articles behind `total` */
  articles: number;
  /** how many categories there were before `limit` cut them */
  available: number;
};

const ALL = "all";

export function group(
  articles: ArchiveArticle[],
  options: {
    measure: Measure;
    by: Dimension;
    breakdown: Dimension | "none";
    filters: Filters;
    limit?: number;
  },
): Grouped {
  const { measure, by, breakdown, filters } = options;
  const needsPeople =
    by === "person" ||
    breakdown === "person" ||
    by === "role" ||
    breakdown === "role";
  const list = units(articles, measure, filters, needsPeople);

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

  const values: Record<string, Record<string, number>> = {};
  const categoryLabels = new Map<string, string>();
  const seriesLabels = new Map<string, string>();

  for (const unit of list) {
    const category = keyOf(unit, by);
    const series =
      breakdown === "none"
        ? { key: ALL, label: measure }
        : keyOf(unit, breakdown);
    categoryLabels.set(category.key, category.label);
    seriesLabels.set(series.key, series.label);
    const row = (values[category.key] ??= {});
    row[series.key] = (row[series.key] ?? 0) + 1;
  }

  const totalOf = (key: string) =>
    Object.values(values[key] ?? {}).reduce((a, b) => a + b, 0);

  let categories: { key: string; label: string }[];
  if (by === "month" || by === "semester" || by === "year") {
    categories = fillPeriods([...categoryLabels.keys()], by);
  } else {
    categories = [...categoryLabels].map(([key, label]) => ({ key, label }));
    categories.sort(
      (a, b) =>
        totalOf(b.key) - totalOf(a.key) || a.label.localeCompare(b.label),
    );
    if (options.limit) categories = categories.slice(0, options.limit);
  }

  const series = [...seriesLabels].map(([key, label]) => ({ key, label }));
  series.sort((a, b) =>
    breakdown === "month" || breakdown === "semester" || breakdown === "year"
      ? a.key.localeCompare(b.key)
      : a.label.localeCompare(b.label),
  );

  return {
    categories,
    series,
    values,
    total: list.length,
    articles: new Set(list.map((unit) => unit.article.id)).size,
    available: categoryLabels.size,
  };
}

export type PersonRow = {
  name: string;
  /** credits per role */
  counts: Record<Role, number>;
  /** distinct articles credited on, any role */
  articles: number;
  first: string;
  last: string;
  /** printed bylines that resolved to this person through the Sheet */
  aliases: string[];
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
      for (const name of credit.names) {
        const row =
          rows.get(name) ??
          ({
            name,
            counts: { writer: 0, image: 0, other: 0 },
            articles: 0,
            first: date,
            last: date,
            aliases: [],
            articleIds: [],
          } satisfies PersonRow);
        row.counts[credit.role]++;
        if (!row.articleIds.includes(article.id)) {
          row.articleIds.push(article.id);
          row.articles++;
        }
        if (date < row.first) row.first = date;
        if (date > row.last) row.last = date;
        if (credit.overridden && credit.printed)
          for (const printed of credit.parsed)
            if (printed !== name && !row.aliases.includes(printed))
              row.aliases.push(printed);
        rows.set(name, row);
      }
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.articles - a.articles || a.name.localeCompare(b.name),
  );
}

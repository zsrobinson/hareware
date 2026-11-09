/*
  Slicing the archive for the pages: filtering, grouping by period, section,
  role or person, and the people table. Pure, and shared by every view so a
  filter means the same thing on each.
*/

import type { ArchiveArticle } from "./archive";
import { ROLES, type Role } from "./labels";
import {
  contributionsOn,
  peopleOf,
  type Contribution,
  type Person,
} from "./person";
import { compareSections } from "./sections";

export type Filters = {
  /** inclusive `YYYY-MM-DD`, Eastern; absent for open-ended */
  from?: string;
  to?: string;
  /** empty means every section */
  sections: string[];
  /** empty means every role */
  roles: Role[];
  /** names, exactly: only these people's own contributions count. Empty
      means everyone */
  people: string[];
  /** post ids, exactly: only these articles count, as a chart's mark picked
      them. Absent or empty means every article */
  articles?: readonly number[];
  /** a substring of a title or a credit line as printed */
  search?: string;
};

export const NO_FILTERS: Filters = { sections: [], roles: [], people: [] };

const PERIODS = ["month", "semester", "school-year", "year"] as const;
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

/** whether the filters count a contribution: in a role and by a person picked */
export const isCounted =
  ({ roles, people }: Filters) =>
  ({ role, person }: { role: Role; person: string }) =>
    (roles.length === 0 || roles.includes(role)) &&
    (people.length === 0 || people.includes(person));

/** an article stays under a role or person filter only with a contribution it counts */
function hasCounted(article: ArchiveArticle, filters: Filters) {
  if (filters.roles.length === 0 && filters.people.length === 0) return true;
  return contributionsOn(article).some(isCounted(filters));
}

/**
 * The articles the filters leave. The search looks at what the article
 * prints, its title and credit lines, never at who the Sheet says a byline
 * is: a person's own contributions are the people filter's, and a name
 * searched for would count everyone on the articles it is on.
 */
export function applyFilters(
  articles: ArchiveArticle[],
  filters: Filters,
): ArchiveArticle[] {
  const search = filters.search?.trim()
    ? searchable(filters.search.trim())
    : "";

  const picked = filters.articles?.length ? new Set(filters.articles) : null;
  return articles.filter((article) => {
    if (picked && !picked.has(article.id)) return false;
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
          ...article.credits.map((credit) => credit.printed),
        ].join(" "),
      );
      if (!haystack.includes(search)) return false;
    }
    return hasCounted(article, filters);
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
export type Unit = { article: ArchiveArticle; role?: Role; person?: string };

/**
 * One of the things a number counts: an article, a contribution or a
 * newcomer's first contribution, each one unit; or, when people are counted,
 * a person with every contribution of theirs the number covers.
 */
export type Member = { id: string | number; units: Unit[] };

function contributions(
  articles: ArchiveArticle[],
  filters: Filters,
): Contribution[] {
  return articles.flatMap((article) =>
    contributionsOn(article).filter(isCounted(filters)),
  );
}

function units(
  articles: ArchiveArticle[],
  measure: Measure,
  filters: Filters,
  history: ArchiveArticle[],
): Unit[] {
  if (measure === "articles")
    /* every article counts once; with a role or person picked, only those
       with a contribution the filters count */
    return articles
      .filter((article) => hasCounted(article, filters))
      .map((article) => ({ article }));

  if (measure === "newcomers") {
    /* new once, at their first contribution in the whole archive in any
       role: a period filter must not make everyone in its first month new,
       nor a role filter make someone new at their first image */
    const shown = new Set(articles.map((article) => article.id));
    const counted = isCounted(filters);
    return [...peopleOf(history).values()].flatMap(
      ({ first, contributions }) => {
        if (!shown.has(first.article.id)) return [];
        const unit = contributions.find(
          (c) => c.article === first.article && counted(c),
        );
        return unit ? [unit] : [];
      },
    );
  }

  return contributions(articles, filters);
}

/** how many contributions someone made in each period they made any */
export function periodsOf(person: Person, period: Period): Map<string, number> {
  const out = new Map<string, number>();
  for (const { article } of person.contributions) {
    const { key } = periodOf(easternDate(article.publishedAt), period);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

export type Grouped = {
  /** what was counted, which grouping by person or role can change */
  measure: Measure;
  categories: { key: string; label: string }[];
  series: { key: string; label: string }[];
  /** value[categoryKey][seriesKey]: how many members the cell has */
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
  /** what each cell counts, before a running total gathers it; read through `membersOf` */
  cells: Record<string, Record<string, Member[]>>;
  /** each period holds everything up to and including it */
  running: boolean;
};

/**
 * What a category's number counts, in the series given (every series if
 * none are): its members. Every value and total is the length of this list,
 * so a list and the number it explains cannot disagree.
 */
export function membersOf(
  grouped: Pick<Grouped, "categories" | "series" | "cells" | "running">,
  category: string,
  series: readonly string[] = grouped.series.map((s) => s.key),
): Member[] {
  const at = grouped.categories.findIndex((c) => c.key === category);
  const keys =
    grouped.running && at >= 0
      ? grouped.categories.slice(0, at + 1).map((c) => c.key)
      : [category];
  return membersAcross(grouped, keys, series);
}

/** what several categories count together, each as counted, not running */
export function membersAcross(
  grouped: Pick<Grouped, "cells">,
  categories: readonly string[],
  series: readonly string[],
): Member[] {
  /* one person in two cells is one member, with both cells' contributions */
  const merged = new Map<string | number, Unit[]>();
  for (const key of categories)
    for (const s of series)
      for (const member of grouped.cells[key]?.[s] ?? []) {
        const held = merged.get(member.id);
        if (held) held.push(...member.units);
        else merged.set(member.id, [...member.units]);
      }
  return [...merged].map(([id, units]) => ({ id, units }));
}

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

  /* what makes two units one member: the same person, when people are counted */
  const identity = (unit: Unit, index: number): string | number =>
    measure === "people" ? unit.person! : index;

  const cells = new Map<string, Map<string, Map<string | number, Unit[]>>>();
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
    const row =
      cells.get(category.key) ??
      new Map<string, Map<string | number, Unit[]>>();
    cells.set(category.key, row);
    const cell = row.get(series.key) ?? new Map<string | number, Unit[]>();
    row.set(series.key, cell);
    const id = identity(unit, index);
    cell.set(id, [...(cell.get(id) ?? []), unit]);
  });

  const members: Grouped["cells"] = Object.fromEntries(
    [...cells].map(([key, row]) => [
      key,
      Object.fromEntries(
        [...row].map(([series, cell]) => [
          series,
          [...cell].map(([id, units]) => ({ id, units })),
        ]),
      ),
    ]),
  );
  const series = [...seriesLabels].map(([key, label]) => ({ key, label }));
  series.sort(naturalOrder(breakdown));
  const running = Boolean(options.running) && isPeriod(by);
  const own = { categories: [], series, cells: members, running: false };

  let categories: { key: string; label: string }[];
  if (isPeriod(by)) {
    categories = fillPeriods([...categoryLabels.keys()], by);
  } else {
    /* the biggest first, by the members each has */
    const sizes = new Map(
      [...cells.keys()].map((key) => [key, membersOf(own, key).length]),
    );
    const sizeOf = (key: string) => sizes.get(key) ?? 0;
    categories = [...categoryLabels].map(([key, label]) => ({ key, label }));
    categories.sort(
      (a, b) => sizeOf(b.key) - sizeOf(a.key) || a.label.localeCompare(b.label),
    );
    if (options.limit) categories = categories.slice(0, options.limit);
    if (options.order === "natural") categories.sort(naturalOrder(by));
  }

  /* every number here is the length of a list `membersOf` gives */
  const shape = { categories, series, cells: members, running };
  const values: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  for (const key of running ? categories.map((c) => c.key) : cells.keys()) {
    const total = membersOf(shape, key).length;
    if (total === 0) continue;
    totals[key] = total;
    values[key] = Object.fromEntries(
      series.flatMap(({ key: s }) => {
        const n = membersOf(shape, key, [s]).length;
        return n > 0 ? [[s, n] as const] : [];
      }),
    );
  }

  return {
    measure,
    categories,
    series,
    values,
    totals,
    total: new Set(list.map(identity)).size,
    articles: new Set(list.map((unit) => unit.article.id)).size,
    available: categoryLabels.size,
    cells: members,
    running,
  };
}

export type PersonRow = {
  name: string;
  /** contributions per role */
  counts: Record<Role, number>;
  contributions: number;
  /** their first and latest contribution in the whole archive, whatever the filters */
  first: string;
  last: string;
  /** printed bylines the Sheet counts as this person */
  bylines: string[];
  articleIds: number[];
};

/** each person's contributions the filters count, with their whole span */
export function people(
  articles: ArchiveArticle[],
  filters: Filters,
  /** the whole archive, where a person's first and latest are looked for */
  history: ArchiveArticle[] = articles,
): PersonRow[] {
  const everyone = peopleOf(history);
  const rows = new Map<string, PersonRow>();

  for (const unit of contributions(articles, filters)) {
    const { article, role, person: name, bylines } = unit;
    let row = rows.get(name);
    if (!row) {
      const own = everyone.get(name);
      const date = easternDate(article.publishedAt);
      row = {
        name,
        counts: { writer: 0, image: 0, other: 0 },
        contributions: 0,
        first: own ? easternDate(own.first.article.publishedAt) : date,
        last: own ? easternDate(own.latest.article.publishedAt) : date,
        bylines: [],
        articleIds: [],
      };
      rows.set(name, row);
    }
    row.counts[role]++;
    row.contributions++;
    if (!row.articleIds.includes(article.id)) row.articleIds.push(article.id);
    for (const byline of bylines)
      if (!row.bylines.includes(byline)) row.bylines.push(byline);
  }

  return [...rows.values()].sort(
    (a, b) => b.contributions - a.contributions || a.name.localeCompare(b.name),
  );
}

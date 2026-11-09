/*
  What a chart counts and how it is drawn, and what the options mean for one
  another. A view (./views) declares one as its layout; ./view-state keeps
  the one on screen in the address.
*/

import type { ArchiveArticle } from "~/lib/credits/archive";
import { COMPARES, type Compare } from "./compare";
import {
  group,
  isPeriod,
  isQuantity,
  type Dimension,
  type Filters,
  type Grouped,
  type Measure,
  type Order,
} from "~/lib/credits/stats";

export type Split = "none" | "section" | "role" | "joined";
export type Draw = "stacked" | "grouped" | "lines";
export type Values = "number" | "share" | "running" | "per-article";

export type ChartConfig = {
  count: Measure;
  by: Dimension;
  split: Split;
  draw: Draw;
  values: Values;
  /** a category axis's order; a time axis is always in time order */
  order: Order;
  /** the biggest this many people, or 0 for everyone */
  top: number;
  /** each category against an earlier range, as paired bars */
  compare: Compare;
};

export const COUNTS: { id: Measure; label: string }[] = [
  { id: "articles", label: "Articles" },
  { id: "contributions", label: "Contributions" },
  { id: "people", label: "People" },
  { id: "newcomers", label: "New people" },
  { id: "words", label: "Words" },
  { id: "views", label: "Views" },
];

export const GROUPINGS: { id: Dimension; label: string }[] = [
  { id: "semester", label: "Semester" },
  { id: "school-year", label: "School year" },
  { id: "year", label: "Year" },
  { id: "month", label: "Month" },
  { id: "section", label: "Section" },
  { id: "role", label: "Role" },
  { id: "person", label: "Person" },
];

export const SPLITS: { id: Split; label: string }[] = [
  { id: "none", label: "Nothing" },
  { id: "section", label: "Section" },
  { id: "role", label: "Role" },
  { id: "joined", label: "Joined in" },
];

export const DRAWS: Draw[] = ["stacked", "grouped", "lines"];
export const VALUES: Values[] = ["number", "share", "running", "per-article"];
export const ORDERS: Order[] = ["largest", "natural"];
export const TOPS = [10, 25, 50, 0];

/**
 * What the options mean for one another, as the builder offers them. An
 * option that would have to change another is off until that one changes,
 * so no choice moves a setting it was not made in.
 */
export function allows(config: ChartConfig) {
  const { count, by, split, compare } = config;
  const time = isPeriod(by);
  const quantity = isQuantity(count);
  /* two ranges of a category side by side: across time, the axis is
     already the comparison, and a split's stack of two ranges would add
     up to a total of neither. Views are lifetime views, which an earlier
     range has had longer to gather, and none before January 2023 */
  const comparable =
    !time &&
    split === "none" &&
    config.values === "number" &&
    count !== "views";
  const comparing = compare !== "none";
  /* an article has no one role, person or intake; and by person, every
     person is one */
  const articles =
    by !== "person" && by !== "role" && split !== "role" && split !== "joined";
  /* someone has one intake, so people split by it add up to the whole */
  const parts = split === "none" || split === "joined";
  const people = by !== "person";
  /* an article credited in two roles, or to two people, is in both: its
     words counted twice in a stack, and shares that add up past the whole */
  const overlapping = by === "person" || by === "role" || split === "role";
  /* an intake is people's, not articles' */
  const ofArticles = split !== "joined";
  return {
    count: {
      articles,
      contributions: true,
      people,
      newcomers: people,
      words: ofArticles,
      views: ofArticles && !comparing,
    } satisfies Record<Measure, boolean>,
    by: Object.fromEntries(
      GROUPINGS.map(({ id }) => [
        id,
        id === "person"
          ? count === "contributions" || quantity
          : id === "role"
            ? count !== "articles" && split !== "role"
            : (id !== "section" || split !== "section") &&
              !(comparing && isPeriod(id)),
      ]),
    ) as Record<Dimension, boolean>,
    split: {
      none: true,
      section: by !== "section" && !comparing,
      role: by !== "role" && count !== "articles" && !comparing,
      joined: count !== "articles" && !quantity && !comparing,
    } satisfies Record<Split, boolean>,
    draw: {
      /* one person in two sections would be drawn twice in one column */
      stacked:
        (count !== "people" || parts) &&
        !(quantity && split === "role") &&
        /* averages do not add up to a column */
        !(config.values === "per-article" && split !== "none") &&
        !comparing,
      grouped: split !== "none" || comparing,
      lines: time,
    } satisfies Record<Draw, boolean>,
    values: {
      number: true,
      /* distinct people do not add up to a whole to take a share of,
         except split by when they joined */
      share:
        (count !== "people" || split === "joined") &&
        !(quantity && overlapping) &&
        !comparing,
      running: time,
      /* words or views over the articles counted: of a sum, not a count */
      "per-article":
        quantity &&
        !(config.draw === "stacked" && split !== "none") &&
        !comparing,
    } satisfies Record<Values, boolean>,
    compare: Object.fromEntries(
      COMPARES.map(({ id }) => [id, id === "none" || comparable]),
    ) as Record<Compare, boolean>,
    order: !time,
    top: by === "person",
  };
}

/** what a configuration counts, over the articles the filters left */
export function groupOf(
  config: ChartConfig,
  shown: ArchiveArticle[],
  filters: Filters,
  /** the whole archive, where a newcomer's first contribution is looked for */
  history: ArchiveArticle[],
): Grouped {
  const { count, by, split, order, top, values } = config;
  return group(shown, {
    measure: count,
    by,
    breakdown: split,
    filters,
    order,
    limit: by === "person" ? top || undefined : undefined,
    running: values === "running",
    history,
  });
}

/** the nearest configuration the builder could have made, so the url and the drawing never disagree */
export function settle(config: ChartConfig): ChartConfig {
  const next = { ...config };
  if (next.split === next.by) next.split = "none";
  let ok = allows(next);
  if (!ok.count[next.count]) next.count = "contributions";
  ok = allows(next);
  if (!ok.compare[next.compare]) next.compare = "none";
  ok = allows(next);
  if (!ok.draw[next.draw])
    next.draw = DRAWS.find((draw) => ok.draw[draw]) ?? "stacked";
  if (!ok.values[next.values]) next.values = "number";
  if (!TOPS.includes(next.top)) next.top = 25;
  return next;
}

const pick = <T extends string>(
  value: string | null,
  options: readonly T[],
  fallback: T,
): T => (options.includes(value as T) ? (value as T) : fallback);

/** a chart a link names, settled; a setting it leaves out is `fallback`'s */
export function readChart(
  params: URLSearchParams,
  fallback: ChartConfig,
): ChartConfig {
  const d = fallback;
  const top = Number(params.get("top"));
  return settle({
    count: pick(
      params.get("count"),
      COUNTS.map((c) => c.id),
      d.count,
    ),
    by: pick(
      params.get("by"),
      GROUPINGS.map((g) => g.id),
      d.by,
    ),
    split: pick(
      params.get("split"),
      SPLITS.map((s) => s.id),
      d.split,
    ),
    draw: pick(params.get("draw"), DRAWS, d.draw),
    values: pick(params.get("values"), VALUES, d.values),
    order: pick(params.get("order"), ORDERS, d.order),
    top: params.has("top") && TOPS.includes(top) ? top : d.top,
    compare: pick(
      params.get("compare"),
      COMPARES.map((c) => c.id),
      d.compare,
    ),
  });
}

/** each setting, by its name in a link */
export const CHART_PARAMS = [
  "count",
  "by",
  "split",
  "draw",
  "values",
  "order",
  "top",
  "compare",
] as const;

/** writes a chart into `params`, or takes one out (null) */
export function writeChart(chart: ChartConfig | null, params: URLSearchParams) {
  for (const key of CHART_PARAMS)
    if (chart) params.set(key, String(chart[key]));
    else params.delete(key);
}

/*
  What the Charts page draws, kept in the url beside the filters so a link
  reproduces the chart. A saved view is one of ./views, a configuration and
  the filters it opens on; Custom is whatever the builder last made, on the
  filters of the view it was made from. Every view is a configuration the
  builder can show, so choosing one and then changing a setting starts from
  exactly what was on screen. The range is only where Time starts: changing
  it is a filter, and leaves the view as it is. The series the legend has
  off are kept too, so a link shows what was on screen.
*/

import type { ArchiveArticle } from "~/lib/credits/archive";
import {
  group,
  isPeriod,
  type Dimension,
  type Filters,
  type Grouped,
  type Measure,
  type Order,
} from "~/lib/credits/stats";
import { clearedState, type FilterState, type Preset } from "./filters";
import { VIEWS, type View } from "./views";

export type Split = "none" | "section" | "role";
export type Draw = "stacked" | "grouped" | "lines";
export type Values = "number" | "share" | "running";

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
};

export const COUNTS: { id: Measure; label: string }[] = [
  { id: "articles", label: "Articles" },
  { id: "contributions", label: "Contributions" },
  { id: "people", label: "People" },
  { id: "newcomers", label: "New people" },
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
];

export const DRAWS: Draw[] = ["stacked", "grouped", "lines"];
export const VALUES: Values[] = ["number", "share", "running"];
export const ORDERS: Order[] = ["largest", "natural"];
export const TOPS = [10, 25, 50, 0];

export type ViewId = (typeof VIEWS)[number]["id"] | "custom";

export type SavedId = (typeof VIEWS)[number]["id"];

export type ChartState = {
  view: ViewId;
  /** null until the builder has been used, so Custom starts from what was on screen */
  custom: ChartConfig | null;
  /** the saved view Custom was made from, which Reset goes back to */
  base: SavedId;
  /** the series the legend has off */
  hidden: string[];
};

const FIRST = VIEWS[0];
const DEFAULT_CONFIG: ChartConfig = FIRST.layout.chart;

const savedView = (id: SavedId) => VIEWS.find((view) => view.id === id)!;
const viewOf = (state: Pick<ChartState, "view" | "base">) =>
  savedView(state.view === "custom" ? state.base : state.view);

export function configOf(state: ChartState): ChartConfig {
  if (state.view === "custom") return state.custom ?? DEFAULT_CONFIG;
  return savedView(state.view).layout.chart;
}

/** what a saved view answers; Custom answers whatever was asked of it */
export function questionOf(state: Pick<ChartState, "view">): string | null {
  return state.view === "custom" ? null : savedView(state.view).question;
}

/** the Time filter the chart opens on, which its link leaves out */
export function rangeOfView(state: Pick<ChartState, "view" | "base">): Preset {
  return viewOf(state).range;
}

/** every filter as the chart's view opens on it */
export function openingOf(
  state: Pick<ChartState, "view" | "base">,
): FilterState {
  const view: View = viewOf(state);
  const { sections = [], roles = [], people = [] } = view.filters ?? {};
  return {
    ...clearedState(view.range),
    sections: [...sections],
    roles: [...roles],
    people: [...people],
  };
}

/**
 * What the options mean for one another, as the builder offers them. An
 * option that would have to change another is off until that one changes,
 * so no choice moves a setting it was not made in.
 */
export function allows(config: ChartConfig) {
  const { count, by, split } = config;
  const time = isPeriod(by);
  /* an article has no one role or person; and by person, every person is one */
  const articles = by !== "person" && by !== "role" && split !== "role";
  const people = by !== "person";
  return {
    count: {
      articles,
      contributions: true,
      people,
      newcomers: people,
    } satisfies Record<Measure, boolean>,
    by: Object.fromEntries(
      GROUPINGS.map(({ id }) => [
        id,
        id === "person"
          ? count === "contributions"
          : id === "role"
            ? count !== "articles" && split !== "role"
            : id !== "section" || split !== "section",
      ]),
    ) as Record<Dimension, boolean>,
    split: {
      none: true,
      section: by !== "section",
      role: by !== "role" && count !== "articles",
    } satisfies Record<Split, boolean>,
    draw: {
      /* one person in two sections would be drawn twice in one column */
      stacked: !(count === "people" && split !== "none"),
      grouped: split !== "none",
      lines: time,
    } satisfies Record<Draw, boolean>,
    values: {
      number: true,
      /* distinct people do not add up to a whole to take a share of */
      share: count !== "people",
      running: time,
    } satisfies Record<Values, boolean>,
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

const savedId = (id: string | null): SavedId =>
  VIEWS.find((v) => v.id === id)?.id ?? FIRST.id;

export function readChart(search: string): ChartState {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  const hidden = (params.get("hide") ?? "").split(",").filter(Boolean);
  /* a view no longer offered (Mix, before Headcount) opens the first */
  if (view !== "custom")
    return { view: savedId(view), custom: null, base: savedId(view), hidden };
  const d = DEFAULT_CONFIG;
  const top = Number(params.get("top"));
  return {
    view: "custom",
    base: savedId(params.get("base")),
    hidden,
    custom: settle({
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
    }),
  };
}

const KEYS = [
  "count",
  "by",
  "split",
  "draw",
  "values",
  "order",
  "top",
] as const;

/** writes the chart into `params`, leaving the filters' own parameters alone */
export function writeChart(state: ChartState, params: URLSearchParams) {
  if (state.view === FIRST.id) params.delete("view");
  else params.set("view", state.view);
  const custom = state.view === "custom" ? configOf(state) : null;
  for (const key of KEYS)
    if (custom) params.set(key, String(custom[key]));
    else params.delete(key);
  if (custom && state.base !== FIRST.id) params.set("base", state.base);
  else params.delete("base");
  if (state.hidden.length > 0) params.set("hide", state.hidden.join(","));
  else params.delete("hide");
}

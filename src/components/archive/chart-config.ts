/*
  What the Charts page draws, kept in the url beside the filters so a link
  reproduces the chart. A saved view is a name for one configuration; Custom
  is whatever the builder last made. Every view is a configuration the builder
  can show, so choosing one and then changing a setting starts from exactly
  what was on screen.
*/

import {
  isPeriod,
  type Dimension,
  type Measure,
  type Order,
} from "~/lib/credits/stats";

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

export const VIEWS = [
  {
    id: "over-time",
    label: "Over time",
    config: {
      count: "articles",
      by: "semester",
      split: "section",
      draw: "stacked",
      values: "number",
      order: "largest",
      top: 25,
    },
  },
  {
    id: "mix",
    label: "Mix",
    config: {
      count: "articles",
      by: "semester",
      split: "section",
      draw: "stacked",
      values: "share",
      order: "largest",
      top: 25,
    },
  },
  {
    id: "contributors",
    label: "Contributors",
    config: {
      count: "contributions",
      by: "person",
      split: "role",
      draw: "stacked",
      values: "number",
      order: "largest",
      top: 25,
    },
  },
  {
    id: "totals",
    label: "Totals",
    config: {
      count: "articles",
      by: "section",
      split: "none",
      draw: "stacked",
      values: "number",
      order: "natural",
      top: 25,
    },
  },
] as const satisfies { id: string; label: string; config: ChartConfig }[];

export type ViewId = (typeof VIEWS)[number]["id"] | "custom";

export type ChartState = {
  view: ViewId;
  /** null until the builder has been used, so Custom starts from what was on screen */
  custom: ChartConfig | null;
};

const DEFAULT_CONFIG: ChartConfig = VIEWS[0].config;

export function configOf(state: ChartState): ChartConfig {
  if (state.view === "custom") return state.custom ?? DEFAULT_CONFIG;
  return VIEWS.find((view) => view.id === state.view)!.config;
}

/** what the options mean for one another, as the builder offers them */
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
    split: {
      none: true,
      section: by !== "section",
      role: by !== "role",
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

export function readChart(search: string): ChartState {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view !== "custom")
    return {
      view: VIEWS.find((v) => v.id === view)?.id ?? "over-time",
      custom: null,
    };
  const d = DEFAULT_CONFIG;
  const top = Number(params.get("top"));
  return {
    view: "custom",
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
  if (state.view === "over-time") params.delete("view");
  else params.set("view", state.view);
  const custom = state.view === "custom" ? configOf(state) : null;
  for (const key of KEYS)
    if (custom) params.set(key, String(custom[key]));
    else params.delete(key);
}

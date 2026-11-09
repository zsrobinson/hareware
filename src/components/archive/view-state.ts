/*
  Which view a page shows, kept in the address beside the filters so a link
  reproduces it: one of the page's own views (./views), or Custom, whatever
  the builder last made, on the filters of the view it was made from. Every
  view is a layout the builder can show, so choosing one and then changing
  a setting starts from exactly what was on screen.

  The range and a table's sort are only where a view starts: changing
  either leaves the view as it is, and is kept when another view is chosen,
  until Clear. The series a chart's legend has off are kept too, so a link
  shows what was on screen.
*/

import {
  readChart,
  settle,
  writeChart,
  type ChartConfig,
} from "./chart-config";
import { clearedState, type FilterState, type Preset } from "./filters";
import { readSort, writeSort } from "./page-state";
import {
  COLUMNS,
  VIEWS,
  type ColumnId,
  type Layout,
  type Source,
  type TableSort,
  type View,
} from "./views";

/** what the builder makes: a table's columns (its sort is the page's), or a chart */
export type Shape =
  | { type: "table"; columns: readonly ColumnId[] }
  | { type: "chart"; chart: ChartConfig };

export type ViewState = {
  /** one of the page's views, or "custom" */
  view: string;
  /** null until the builder has been used, so Custom starts from what was on screen */
  custom: Shape | null;
  /** the view Custom was made from, which Reset goes back to */
  base: string;
  /** the series a chart's legend has off */
  hidden: string[];
  /** a table's sort, which each view opens on its own of */
  sort: TableSort;
};

export const CUSTOM = "custom";

/** a page's views, its tabs in order; the first is a table, and opens the page */
export const viewsOn = (source: Source): View[] =>
  VIEWS.filter((view) => view.source === source);

const firstOf = (source: Source) => viewsOn(source)[0]!;

const find = (source: Source, id: string | null) =>
  viewsOn(source).find((view) => view.id === id);

/** the view on screen, or the one Custom was made from */
export const viewOf = (
  state: Pick<ViewState, "view" | "base">,
  source: Source,
): View =>
  find(source, state.view === CUSTOM ? state.base : state.view) ??
  firstOf(source);

const shapeOfView = ({ layout }: View): Shape =>
  layout.type === "table"
    ? { type: "table", columns: layout.table.columns }
    : { type: "chart", chart: layout.chart };

/** what is on screen, as the builder shows it */
export function shapeOf(state: ViewState, source: Source): Shape {
  if (state.view === CUSTOM && state.custom) return state.custom;
  return shapeOfView(viewOf(state, source));
}

/** what is on screen, as a view declares it */
export function layoutOf(state: ViewState, source: Source): Layout {
  const shape = shapeOf(state, source);
  return shape.type === "table"
    ? { type: "table", table: { columns: shape.columns, sort: state.sort } }
    : shape;
}

/** the sort a view opens on: its own, or for a chart, the page's first table's */
function openingSort(view: View, source: Source): TableSort {
  const layout =
    view.layout.type === "table" ? view.layout : firstOf(source).layout;
  if (layout.type !== "table") throw new Error(`${source} opens on a chart`);
  return layout.table.sort;
}

const sameSort = (a: TableSort, b: TableSort) =>
  a.id === b.id && a.desc === b.desc;

/** what a view answers; Custom answers whatever was asked of it */
export function questionOf(state: ViewState, source: Source): string | null {
  return state.view === CUSTOM ? null : viewOf(state, source).question;
}

/** the Time filter the view opens on, which its link leaves out */
export const rangeOfView = (
  state: Pick<ViewState, "view" | "base">,
  source: Source,
): Preset => viewOf(state, source).range;

/** every filter as the view opens on it */
export function openingOf(
  state: Pick<ViewState, "view" | "base">,
  source: Source,
): FilterState {
  const view = viewOf(state, source);
  const { sections = [], roles = [], people = [] } = view.filters ?? {};
  return {
    ...clearedState(view.range),
    sections: [...sections],
    roles: [...roles],
    people: [...people],
  };
}

/** a page's chart, for a Custom chart made from a table */
const firstChart = (source: Source): ChartConfig => {
  const view = viewsOn(source).find((v) => v.layout.type === "chart");
  if (view?.layout.type === "chart") return view.layout.chart;
  /* a page with no chart of its own borrows the archive's first */
  const any = VIEWS.find((v) => v.layout.type === "chart")!;
  return (any.layout as Extract<Layout, { type: "chart" }>).chart;
};

const firstColumns = (source: Source): readonly ColumnId[] => {
  const { layout } = firstOf(source);
  return layout.type === "table" ? layout.table.columns : COLUMNS[source];
};

const list = (value: string | null) =>
  value ? value.split(",").filter(Boolean) : [];

export function readView(search: string, source: Source): ViewState {
  const params = new URLSearchParams(search);
  const asked = params.get("view");
  const custom = asked === CUSTOM;
  /* a view no longer offered, or another page's, opens the first */
  const base = (find(source, custom ? params.get("base") : asked) ??
    firstOf(source))!;
  const all: readonly string[] = COLUMNS[source];
  const columns = [...new Set(list(params.get("columns")))].filter((id) =>
    all.includes(id),
  ) as ColumnId[];
  const shape = shapeOfView(base);
  /* a Custom link from before tables had no layout: it was a chart */
  const built: Shape | null = !custom
    ? null
    : params.get("layout") === "table"
      ? {
          type: "table",
          columns: columns.length > 0 ? columns : firstColumns(source),
        }
      : {
          type: "chart",
          chart: readChart(
            params,
            shape.type === "chart" ? shape.chart : firstChart(source),
          ),
        };
  const opening = openingSort(base, source);
  const [sort] = readSort(search, COLUMNS[source]);
  return {
    view: custom ? CUSTOM : base.id,
    custom: built,
    base: base.id,
    hidden: list(params.get("hide")),
    sort: params.has("sort") && sort ? (sort as TableSort) : opening,
  };
}

/** writes the view into `params`, leaving the filters' own parameters alone */
export function writeView(
  state: ViewState,
  params: URLSearchParams,
  source: Source,
) {
  const first = firstOf(source).id;
  if (state.view === first) params.delete("view");
  else params.set("view", state.view);
  const custom = state.view === CUSTOM ? shapeOf(state, source) : null;
  writeChart(custom?.type === "chart" ? custom.chart : null, params);
  if (custom) params.set("layout", custom.type);
  else params.delete("layout");
  if (custom?.type === "table") params.set("columns", custom.columns.join(","));
  else params.delete("columns");
  if (custom && state.base !== first) params.set("base", state.base);
  else params.delete("base");
  if (state.hidden.length > 0) params.set("hide", state.hidden.join(","));
  else params.delete("hide");
  /* a sort means something only to a table, and only where it is not the view's own */
  const table = shapeOf(state, source).type === "table";
  const own = openingSort(viewOf(state, source), source);
  writeSort(table && !sameSort(state.sort, own) ? [state.sort] : [], params);
}

/**
 * Another view chosen from the tabs. Custom starts from what was on screen
 * until the builder has made one; a sort changed since the last view opened
 * stands, as a filter does (`carryOver`).
 */
export function chooseView(
  state: ViewState,
  id: string,
  source: Source,
): ViewState {
  const next =
    id === CUSTOM && !state.custom && state.view !== CUSTOM
      ? { view: id, custom: shapeOf(state, source), base: state.view }
      : { view: id, custom: state.custom, base: state.base };
  const changed = !sameSort(
    state.sort,
    openingSort(viewOf(state, source), source),
  );
  return {
    ...next,
    /* another chart's series are other things, so all of them start on */
    hidden: [],
    sort: changed ? state.sort : openingSort(viewOf(next, source), source),
  };
}

/** what the builder made: changing a view makes a custom one from it, and the view stays */
export const changeView = (state: ViewState, shape: Shape): ViewState => ({
  ...state,
  view: CUSTOM,
  custom: shape,
  base: state.view === CUSTOM ? state.base : state.view,
  hidden: [],
});

/** back to the view Custom was made from */
export const resetView = (state: ViewState): ViewState => ({
  ...state,
  view: state.base,
  custom: null,
  hidden: [],
});

/** the builder's Layout: the page's own table, or its first chart */
export function switchLayout(
  shape: Shape,
  type: Shape["type"],
  source: Source,
): Shape {
  if (shape.type === type) return shape;
  return type === "table"
    ? { type, columns: firstColumns(source) }
    : { type, chart: settle(firstChart(source)) };
}

/** a column shown or taken out; a table keeps one at least */
export function withColumn(
  columns: readonly ColumnId[],
  id: ColumnId,
  shown: boolean,
): readonly ColumnId[] {
  if (shown) return columns.includes(id) ? columns : [...columns, id];
  return columns.length > 1 ? columns.filter((c) => c !== id) : columns;
}

/** a column moved one place earlier (-1) or later (1) */
export function moveColumn(
  columns: readonly ColumnId[],
  id: ColumnId,
  step: -1 | 1,
): readonly ColumnId[] {
  const at = columns.indexOf(id);
  const to = at + step;
  if (at < 0 || to < 0 || to >= columns.length) return columns;
  const next = [...columns];
  [next[at], next[to]] = [next[to]!, next[at]!];
  return next;
}

/**
 * What is on screen as a declaration for ./views: the view's layout, the
 * range and filters as they are now, and a view's own words (placeholders
 * for Custom, to be written). What a view cannot open on is left as the
 * view had it, and said in `left`.
 */
export function declarationOf(
  state: ViewState,
  filters: FilterState,
  source: Source,
): { view: View; left: string[] } {
  const view = viewOf(state, source);
  const custom = state.view === CUSTOM;
  const narrowed = Object.fromEntries(
    (["sections", "roles", "people"] as const)
      .filter((key) => filters[key].length > 0)
      .map((key) => [key, filters[key]]),
  );
  const left: string[] = [];
  if (filters.preset === "custom")
    left.push(
      `the range on screen (${[filters.from, filters.to].filter(Boolean).join(" to ") || "custom"}): a view opens on one counted from today`,
    );
  if (filters.search.trim())
    left.push(`the search for “${filters.search.trim()}”`);
  return {
    view: {
      id: custom ? "new-view" : view.id,
      label: custom ? "New view" : view.label,
      question: custom ? "What does it answer?" : view.question,
      source,
      range: filters.preset === "custom" ? view.range : filters.preset,
      ...(Object.keys(narrowed).length > 0 ? { filters: narrowed } : {}),
      layout: layoutOf(state, source),
    } as View,
    left,
  };
}

const WIDTH = 80;

/* a value as prettier would print it here: objects open, an array on one
   line where it fits */
function literal(value: unknown, indent: string, room: number): string {
  if (Array.isArray(value)) {
    const items = value.map((item) => literal(item, `${indent}  `, WIDTH));
    const flat = `[${items.join(", ")}]`;
    if (flat.length <= room) return flat;
    return `[\n${items.map((item) => `${indent}  ${item},`).join("\n")}\n${indent}]`;
  }
  if (typeof value === "object" && value !== null) {
    const inner = `${indent}  `;
    const lines = Object.entries(value).map(([key, item]) => {
      const lead = `${inner}${key}: `;
      return `${lead}${literal(item, inner, WIDTH - lead.length - 1)},`;
    });
    return `{\n${lines.join("\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/** a declaration as source text, an item of `VIEWS` ready to paste into ./views */
export function viewSource(view: View, left: readonly string[] = []): string {
  const notes = left.map((what) => `  // not kept: ${what}\n`).join("");
  return `${notes}  ${literal(view, "  ", WIDTH)},\n`;
}

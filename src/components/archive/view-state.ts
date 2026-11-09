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
import { clearedState, type FilterState, type Searching } from "./filters";
import { readChoice, readSort, writeChoice, writeSort } from "./page-state";
import {
  COLUMNS,
  MINIMUMS,
  VIEWS,
  type ColumnId,
  type Minimum,
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
  /** People's Show, which each view opens on its own of, as the sort */
  minimum: Minimum;
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

/** what the search box looks at: a person's names on People's table, and
    what an article prints everywhere else */
export const searchingOf = (shape: Shape, source: Source): Searching =>
  shape.type === "table" ? source : "articles";

/** what is on screen, as the builder shows it */
export function shapeOf(state: ViewState, source: Source): Shape {
  if (state.view === CUSTOM && state.custom) return state.custom;
  return shapeOfView(viewOf(state, source));
}

/**
 * What is on screen, as a view declares it. `off` are the columns the
 * Columns menu has taken out, which the view on screen does not show.
 */
export function layoutOf(
  state: ViewState,
  source: Source,
  off: readonly string[] = [],
): Layout {
  const shape = shapeOf(state, source);
  if (shape.type === "chart")
    return state.hidden.length > 0 ? { ...shape, hidden: state.hidden } : shape;
  const shown = shape.columns.filter((id) => !off.includes(id));
  return {
    type: "table",
    table: {
      columns: shown.length > 0 ? shown : shape.columns,
      sort: state.sort,
      ...(source === "people" && state.minimum !== 1
        ? { minimum: state.minimum }
        : {}),
    },
  } as Layout;
}

/* the table a view opens with: its own, or for a chart, the page's first */
function openingTable(view: View, source: Source) {
  const layout =
    view.layout.type === "table" ? view.layout : firstOf(source).layout;
  if (layout.type !== "table") throw new Error(`${source} opens on a chart`);
  return layout.table;
}

/** the sort a view opens on */
const openingSort = (view: View, source: Source): TableSort =>
  openingTable(view, source).sort;

/** People's Show as a view opens on it */
const openingMinimum = (view: View, source: Source): Minimum => {
  const table = openingTable(view, source);
  return "minimum" in table && table.minimum ? table.minimum : 1;
};

/** the series a view's legend opens with off; Custom opens with them all */
const openingHidden = (
  state: Pick<ViewState, "view" | "base">,
  source: Source,
) => {
  if (state.view === CUSTOM) return [];
  const { layout } = viewOf(state, source);
  return layout.type === "chart" ? [...(layout.hidden ?? [])] : [];
};

const sameSort = (a: TableSort, b: TableSort) =>
  a.id === b.id && a.desc === b.desc;

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** what a view answers; Custom answers whatever was asked of it */
export function questionOf(state: ViewState, source: Source): string | null {
  return state.view === CUSTOM ? null : viewOf(state, source).question;
}

/** every filter as the view opens on it, which its link leaves out */
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
  const view = custom ? CUSTOM : base.id;
  return {
    view,
    custom: built,
    base: base.id,
    /* present and empty is every series on, where the view has some off */
    hidden: params.has("hide")
      ? list(params.get("hide"))
      : openingHidden({ view, base: base.id }, source),
    sort: params.has("sort") && sort ? (sort as TableSort) : opening,
    minimum: Number(
      readChoice(
        search,
        "min",
        MINIMUMS.map(String),
        String(openingMinimum(base, source)),
      ),
    ) as Minimum,
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
  if (same(state.hidden, openingHidden(state, source))) params.delete("hide");
  else params.set("hide", state.hidden.join(","));
  /* a sort changed on a table is held while a chart shows, for the table
     after it, so the link holds it too */
  const view = viewOf(state, source);
  writeSort(
    sameSort(state.sort, openingSort(view, source)) ? [] : [state.sort],
    params,
  );
  writeChoice(
    String(state.minimum),
    params,
    "min",
    String(openingMinimum(view, source)),
  );
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
  const from = viewOf(state, source);
  const to = viewOf(next, source);
  return {
    ...next,
    /* another chart's series are other things: they start as it declares,
       but Custom made now is what was on screen */
    hidden:
      next.view === CUSTOM && next.custom !== state.custom
        ? state.hidden
        : openingHidden(next, source),
    sort: sameSort(state.sort, openingSort(from, source))
      ? openingSort(to, source)
      : state.sort,
    minimum:
      state.minimum === openingMinimum(from, source)
        ? openingMinimum(to, source)
        : state.minimum,
  };
}

/** what the builder made: changing a view makes a custom one from it, and the view stays */
export function changeView(
  state: ViewState,
  shape: Shape,
  source: Source,
): ViewState {
  const before = shapeOf(state, source);
  /* the series are the split's, so the legend holds while it stays */
  const series =
    before.type === "chart" &&
    shape.type === "chart" &&
    before.chart.split === shape.chart.split;
  return {
    ...state,
    view: CUSTOM,
    custom: shape,
    base: state.view === CUSTOM ? state.base : state.view,
    hidden: series ? state.hidden : [],
  };
}

/** back to the view Custom was made from */
export const resetView = (state: ViewState, source: Source): ViewState => ({
  ...state,
  view: state.base,
  custom: null,
  hidden: openingHidden({ view: state.base, base: state.base }, source),
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
  /** the columns the Columns menu has taken out */
  off: readonly string[] = [],
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
  if (filters.articles.length > 0)
    left.push(`the ${filters.articles.length} articles a chart's mark chose`);
  return {
    view: {
      id: custom ? "new-view" : view.id,
      label: custom ? "New view" : view.label,
      question: custom ? "What does it answer?" : view.question,
      source,
      range: filters.preset === "custom" ? view.range : filters.preset,
      ...(Object.keys(narrowed).length > 0 ? { filters: narrowed } : {}),
      layout: layoutOf(state, source, off),
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

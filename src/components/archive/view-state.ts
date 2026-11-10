/*
  Which view a page shows, and how what is on screen differs from that view
  as saved, kept in the address beside the filters so a link reproduces it.
  A link names a view by its id and only what differs from it, so it opens
  edited for whoever follows it, on whatever that view is by then (ADR 0015).
  Every view is a layout the builder can show, so changing a setting starts
  from exactly what was on screen.

  The range, a table's sort, People's Show and the series a chart's legend
  has off are where a view starts, and changing any of them is an edit of
  it, as Customize's are. Edits belong to their view: choosing another opens
  that one as saved.
*/

import {
  readChart,
  settle,
  writeChart,
  type ChartConfig,
} from "./chart-config";
import { isPeriod, type Period } from "~/lib/credits/stats";
import { clearedState, type FilterState, type Searching } from "./filters";
import { readChoice, readSort, writeChoice, writeSort } from "./page-state";
import {
  readPivot,
  settlePivot,
  writePivot,
  type PivotConfig,
} from "./pivot-config";
import {
  COLUMNS,
  MINIMUMS,
  RENAMED,
  VIEWS,
  type ColumnId,
  type Minimum,
  type Layout,
  type Source,
  type TableSort,
  type View,
} from "./views";

/** what the builder makes: a table's columns (its sort is the page's), a chart or a pivot */
export type Shape =
  | { type: "table"; columns: readonly ColumnId[]; only?: "new" }
  | { type: "chart"; chart: ChartConfig }
  | { type: "pivot"; pivot: PivotConfig };

/** what is on screen, besides the filters, whatever the view says */
export type ViewState = {
  /** one of the page's views, or NEW */
  view: string;
  shape: Shape;
  /** the series a chart's legend has off */
  hidden: string[];
  /** a table's sort */
  sort: TableSort;
  /** People's Show */
  minimum: Minimum;
};

/** a view not saved yet, from the page's `+`: a copy of its first. Its id
    is no saved view's: the Sheet's rows may not use it (./saved-views) */
export const NEW = "draft";

/**
 * The view `id` names, as saved: one of the page's, or a new one made from
 * its first. `views` are the page's, in order, never empty.
 */
export function savedOf(views: readonly View[], id: string): View {
  const first = views[0]!;
  if (id === NEW)
    return {
      ...first,
      id: NEW,
      label: "New view",
      title: "New view",
      question: "",
    };
  return views.find((view) => view.id === id) ?? first;
}

const shapeOfView = ({ layout }: View): Shape =>
  layout.type === "table"
    ? {
        type: "table",
        columns: layout.table.columns,
        ...("only" in layout.table && layout.table.only
          ? { only: layout.table.only }
          : {}),
      }
    : layout.type === "chart"
      ? { type: "chart", chart: layout.chart }
      : layout;

/** what the search box looks at: a person's names on People's table, and
    what an article prints everywhere else */
export const searchingOf = (shape: Shape, source: Source): Searching =>
  shape.type === "table" ? source : "articles";

/** What is on screen, as a view declares it. */
export function layoutOf(state: ViewState, source: Source): Layout {
  const { shape } = state;
  if (shape.type === "chart")
    return state.hidden.length > 0 ? { ...shape, hidden: state.hidden } : shape;
  if (shape.type === "pivot") return shape;
  return {
    type: "table",
    table: {
      columns: shape.columns,
      sort: state.sort,
      ...(source === "people" && state.minimum !== 1
        ? { minimum: state.minimum }
        : {}),
      ...(shape.only ? { only: shape.only } : {}),
    },
  } as Layout;
}

/* the table a view opens with: its own, or for a chart, the page's first
   table, or every column by the first */
function openingTable(view: View, views: readonly View[]) {
  const layout =
    view.layout.type === "table"
      ? view.layout
      : views.find((v) => v.layout.type === "table")?.layout;
  if (layout?.type === "table") return layout.table;
  const columns = COLUMNS[view.source];
  return { columns, sort: { id: columns[0], desc: false } };
}

/** People's Show as a view opens on it */
function openingMinimum(view: View, views: readonly View[]): Minimum {
  const table = openingTable(view, views);
  return "minimum" in table && table.minimum ? table.minimum : 1;
}

/** what a view opens on, besides the filters: itself, as saved */
export function openingState(view: View, views: readonly View[]): ViewState {
  return {
    view: view.id,
    shape: shapeOfView(view),
    hidden: view.layout.type === "chart" ? [...(view.layout.hidden ?? [])] : [],
    sort: openingTable(view, views).sort as TableSort,
    minimum: openingMinimum(view, views),
  };
}

/** the view on screen as saved, opened afresh: what Reset goes back to */
export const resetView = (state: ViewState, views: readonly View[]) =>
  openingState(savedOf(views, state.view), views);

const sameSort = (a: TableSort, b: TableSort) =>
  a.id === b.id && a.desc === b.desc;

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const sameShape = (a: Shape, b: Shape) =>
  JSON.stringify(a) === JSON.stringify(b);

/** what heads a view: its own title and question, edited or not */
export function headingOf(
  state: ViewState,
  views: readonly View[],
): { title: string; question: string } {
  const { title, question } = savedOf(views, state.view);
  return { title, question };
}

/** every filter as the view opens on it, which its link leaves out */
export function openingOf(view: View): FilterState {
  const { sections = [], roles = [], people = [] } = view.filters ?? {};
  return {
    ...clearedState(view.range),
    sections: [...sections],
    roles: [...roles],
    people: [...people],
  };
}

/** what can differ from a view as saved, each one edit however much changed */
export type Difference =
  | "range"
  | "sections"
  | "roles"
  | "people"
  | "articles"
  | "search"
  | "layout"
  | "sort"
  | "minimum"
  | "hidden";

/**
 * How what is on screen differs from the view as saved. A sort is a
 * table's, Show People's table's and the legend a chart's: one held while
 * the layout does not show it is not on screen to differ.
 */
export function differences(
  state: ViewState,
  filters: FilterState,
  views: readonly View[],
): Difference[] {
  const saved = savedOf(views, state.view);
  const opening = openingState(saved, views);
  const from = openingOf(saved);
  const listDiffers = (key: "sections" | "roles" | "people") =>
    !same(filters[key], from[key]);
  const table = state.shape.type === "table";
  const found: [Difference, boolean][] = [
    ["range", filters.preset !== from.preset || filters.preset === "custom"],
    ["sections", listDiffers("sections")],
    ["roles", listDiffers("roles")],
    ["people", listDiffers("people")],
    ["articles", filters.articles.length > 0],
    ["search", filters.search.trim() !== ""],
    ["layout", !sameShape(state.shape, opening.shape)],
    ["sort", table && !sameSort(state.sort, opening.sort)],
    [
      "minimum",
      table && saved.source === "people" && state.minimum !== opening.minimum,
    ],
    [
      "hidden",
      state.shape.type === "chart" && !same(state.hidden, opening.hidden),
    ],
  ];
  return found.filter(([, differs]) => differs).map(([key]) => key);
}

/** whether there is anything to save: a new view always has */
export const isEdited = (
  state: ViewState,
  filters: FilterState,
  views: readonly View[],
) => state.view === NEW || differences(state, filters, views).length > 0;

/** a page's first chart or pivot, for one made from something else; a page
    with none of its own borrows the starter set's first */
function firstOf<T extends "chart" | "pivot">(
  views: readonly View[],
  type: T,
): Extract<Layout, { type: T }> {
  const view =
    views.find((v) => v.layout.type === type) ??
    VIEWS.find((v) => v.layout.type === type);
  if (!view) throw new Error(`no view is a ${type}`);
  return view.layout as Extract<Layout, { type: T }>;
}

/** the period a rolling range rounds to, so a view's first period is whole */
export function periodOfShape(shape: Shape): Period | undefined {
  if (shape.type === "chart")
    return isPeriod(shape.chart.by) ? shape.chart.by : undefined;
  if (shape.type === "pivot")
    return [shape.pivot.rows, shape.pivot.columns].find(isPeriod);
  return undefined;
}

const list = (value: string | null) =>
  value ? value.split(",").filter(Boolean) : [];

const LAYOUTS: Shape["type"][] = ["table", "chart", "pivot"];

/** the view a link names, which may be one renamed since or gone */
function asked(params: URLSearchParams, views: readonly View[]) {
  const named = params.get("view");
  /* a Custom link from before views were saved: the view it was made from */
  const id = named === "custom" ? (params.get("base") ?? "") : (named ?? "");
  if (id === "" || id === NEW) return { id: id || views[0]!.id, missing: null };
  if (views.some((view) => view.id === id)) return { id, missing: null };
  const renamed = RENAMED[id];
  if (renamed && views.some((view) => view.id === renamed))
    return { id: renamed, missing: null };
  return { id: views[0]!.id, missing: id };
}

/**
 * What a link opens on. `missing` is a view it names that the page no
 * longer has: it opens the page's first view as saved, since what the link
 * changed was another view's, and the page says so.
 */
export function readView(
  search: string,
  views: readonly View[],
  source: Source,
): { state: ViewState; missing: string | null } {
  const params = new URLSearchParams(search);
  const { id, missing } = asked(params, views);
  const saved = savedOf(views, id);
  const opening = openingState(saved, views);
  if (missing !== null) return { state: opening, missing };

  const all: readonly string[] = COLUMNS[source];
  const savedShape = opening.shape;
  const layout = params.get("layout") as Shape["type"] | null;
  const type = layout && LAYOUTS.includes(layout) ? layout : null;
  const columns = [...new Set(list(params.get("columns")))].filter((c) =>
    all.includes(c),
  ) as ColumnId[];
  const shape: Shape =
    type === null
      ? savedShape
      : type === "table"
        ? {
            type,
            columns:
              columns.length > 0
                ? columns
                : savedShape.type === "table"
                  ? savedShape.columns
                  : openingTable(saved, views).columns,
            ...(source !== "people"
              ? {}
              : params.has("only")
                ? params.get("only") === "new"
                  ? { only: "new" as const }
                  : {}
                : savedShape.type === "table" && savedShape.only
                  ? { only: savedShape.only }
                  : {}),
          }
        : type === "pivot"
          ? {
              type,
              pivot: readPivot(
                params,
                savedShape.type === "pivot"
                  ? savedShape.pivot
                  : firstOf(views, "pivot").pivot,
              ),
            }
          : {
              type,
              chart: readChart(
                params,
                savedShape.type === "chart"
                  ? savedShape.chart
                  : firstOf(views, "chart").chart,
              ),
            };
  const [sort] = readSort(search, all);
  return {
    state: {
      view: saved.id,
      shape,
      /* present and empty is every series on, where the view has some off */
      hidden: params.has("hide") ? list(params.get("hide")) : opening.hidden,
      sort: params.has("sort") && sort ? (sort as TableSort) : opening.sort,
      minimum: Number(
        readChoice(
          search,
          "min",
          MINIMUMS.map(String),
          String(opening.minimum),
        ),
      ) as Minimum,
    },
    missing: null,
  };
}

/* the settings of a chart or a pivot that differ from the saved one's, or
   all of them where the view is saved as something else */
function writeDiffering<T extends Record<string, unknown>>(
  write: (config: T, params: URLSearchParams) => void,
  config: T,
  saved: T | null,
  params: URLSearchParams,
) {
  const mine = new URLSearchParams();
  write(config, mine);
  const theirs = new URLSearchParams();
  if (saved) write(saved, theirs);
  for (const [key, value] of mine)
    if (theirs.get(key) !== value) params.set(key, value);
}

/** writes the view into `params`, each part only where it differs from the
    view as saved, leaving the filters' own parameters alone */
export function writeView(
  state: ViewState,
  params: URLSearchParams,
  views: readonly View[],
) {
  const saved = savedOf(views, state.view);
  const opening = openingState(saved, views);
  if (state.view === views[0]!.id) params.delete("view");
  else params.set("view", state.view);
  params.delete("base");
  /* the two share some names, so both go before either is written */
  writeChart(null, params);
  writePivot(null, params);
  for (const key of ["layout", "columns", "only"]) params.delete(key);
  const { shape } = state;
  const from = opening.shape;
  if (!sameShape(shape, from)) {
    params.set("layout", shape.type);
    if (shape.type === "chart")
      writeDiffering(
        writeChart,
        shape.chart,
        from.type === "chart" ? from.chart : null,
        params,
      );
    if (shape.type === "pivot")
      writeDiffering(
        writePivot,
        shape.pivot,
        from.type === "pivot" ? from.pivot : null,
        params,
      );
    if (shape.type === "table") {
      if (from.type !== "table" || !same(shape.columns, from.columns))
        params.set("columns", shape.columns.join(","));
      const was = from.type === "table" ? from.only : undefined;
      if (shape.only !== was) params.set("only", shape.only ?? "");
    }
  }
  if (same(state.hidden, opening.hidden)) params.delete("hide");
  else params.set("hide", state.hidden.join(","));
  writeSort(sameSort(state.sort, opening.sort) ? [] : [state.sort], params);
  writeChoice(String(state.minimum), params, "min", String(opening.minimum));
}

/** what the builder made: the view stays, edited */
export function changeView(state: ViewState, shape: Shape): ViewState {
  const before = state.shape;
  /* the series are the split's, so the legend holds while it stays */
  const series =
    before.type === "chart" &&
    shape.type === "chart" &&
    before.chart.split === shape.chart.split;
  return { ...state, shape, hidden: series ? state.hidden : [] };
}

/**
 * The builder's Layout: the view's own table, or the page's first chart or
 * pivot. A list of new people stays one: it is drawn as where they
 * started, and as what.
 */
export function switchLayout(
  shape: Shape,
  type: Shape["type"],
  views: readonly View[],
  view: View,
): Shape {
  if (shape.type === type) return shape;
  if (type === "table")
    return { type, columns: openingTable(view, views).columns };
  const fresh = shape.type === "table" && shape.only === "new";
  if (type === "pivot")
    return {
      type,
      pivot: settlePivot(
        fresh
          ? {
              ...firstOf(views, "pivot").pivot,
              count: "newcomers",
              rows: "section",
              columns: "role",
            }
          : firstOf(views, "pivot").pivot,
      ),
    };
  return {
    type,
    chart: settle(
      fresh
        ? {
            ...firstOf(views, "chart").chart,
            count: "newcomers",
            by: "section",
            split: "role",
            order: "natural",
          }
        : firstOf(views, "chart").chart,
    ),
  };
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
 * What is on screen as a declaration, to save: the view's own words, the
 * range and filters as they are now, and the layout. What a view cannot
 * open on is left out, and said in `left`: it stays on screen, an edit
 * still.
 */
export function declarationOf(
  state: ViewState,
  filters: FilterState,
  views: readonly View[],
): { view: View; left: string[] } {
  const saved = savedOf(views, state.view);
  const narrowed = Object.fromEntries(
    (["sections", "roles", "people"] as const)
      .filter((key) => filters[key].length > 0)
      .map((key) => [key, filters[key]]),
  );
  const left: string[] = [];
  if (filters.preset === "custom")
    left.push(
      `the range of dates (${[filters.from, filters.to].filter(Boolean).join(" to ") || "custom"}): a view opens on one counted from today`,
    );
  if (filters.search.trim())
    left.push(`the search for “${filters.search.trim()}”`);
  if (filters.articles.length > 0)
    left.push(`the ${filters.articles.length} articles a chart's mark chose`);
  const { filters: _, ...words } = saved;
  return {
    view: {
      ...words,
      range: filters.preset === "custom" ? saved.range : filters.preset,
      ...(Object.keys(narrowed).length > 0 ? { filters: narrowed } : {}),
      layout: layoutOf(state, saved.source),
    } as View,
    left,
  };
}

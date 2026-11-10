import { expect, test } from "vitest";
import { allows, type ChartConfig } from "./chart-config";
import { allowsPivot, type PivotConfig } from "./pivot-config";
import { chartsAddress } from "./charts-address";
import {
  clearedState,
  readState,
  writeState,
  type FilterState,
} from "./filters";
import {
  changeView,
  declarationOf,
  differences,
  isEdited,
  layoutOf,
  moveColumn,
  NEW,
  openingOf,
  openingState,
  readView,
  resetView,
  savedOf,
  switchLayout,
  withColumn,
  writeView,
  type Shape,
  type ViewState,
} from "./view-state";
import { COLUMNS, VIEWS, type ColumnId, type Source, type View } from "./views";

/* every starter view goes through these, and so do two that use what no
   starter does yet: filters, a legend with series off, and People's Show */
const EXTRA = [
  {
    id: "news-history",
    label: "News history",
    title: "News, by semester",
    question: "What has News published, but for Sports?",
    source: "articles",
    range: "all",
    filters: { sections: ["News", "Sports"] },
    layout: {
      type: "chart",
      chart: {
        count: "articles",
        by: "semester",
        split: "section",
        draw: "stacked",
        values: "number",
        order: "largest",
        top: 25,
        compare: "none",
      },
      hidden: ["Sports"],
    },
  },
  {
    id: "regulars",
    label: "Regulars",
    title: "The regulars",
    question: "Who has done the most?",
    source: "people",
    range: "semester",
    layout: {
      type: "table",
      table: {
        columns: ["name", "contributions"],
        sort: { id: "name", desc: false },
        minimum: 3,
      },
    },
  },
] as const satisfies readonly View[];

const SOURCES: Source[] = ["articles", "people"];
const ALL: readonly View[] = [...VIEWS, ...EXTRA];
/** a page's views, as the Sheet or its starter set gives them */
const on = (source: Source): View[] => ALL.filter((v) => v.source === source);

/** a page as it opens from a link: the view, then the filters from it */
const open = (search: string, source: Source) => {
  const { state } = readView(search, on(source), source);
  return {
    view: state,
    filters: readState(search, openingOf(savedOf(on(source), state.view))),
  };
};
const viewAt = (search: string, source: Source) => open(search, source).view;

const link = (state: ViewState, filters: FilterState, source: Source) => {
  const params = new URLSearchParams();
  const views = on(source);
  writeView(state, params, views);
  writeState(filters, params, openingOf(savedOf(views, state.view)));
  return `?${params}`;
};

const opening = (view: View): ViewState => openingState(view, on(view.source));

test("each page opens on a table, and every starter view is one its page can show", () => {
  const ids = VIEWS.map((view) => view.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).not.toContain(NEW);
  for (const source of SOURCES)
    expect(on(source)[0]?.layout.type, source).toBe("table");
  for (const view of VIEWS)
    if (view.layout.type === "table") {
      const columns: readonly string[] = COLUMNS[view.source];
      for (const id of view.layout.table.columns)
        expect(columns, view.id).toContain(id);
      expect(view.layout.table.columns, view.id).toContain(
        view.layout.table.sort.id,
      );
    }
});

test("every view opens from its link as saved, not edited, and edited back as it was", () => {
  for (const view of ALL) {
    const state = opening(view);
    const filters = openingOf(view);
    const back = open(link(state, filters, view.source), view.source);
    expect(back.view, view.id).toEqual(state);
    expect(layoutOf(back.view, view.source), view.id).toEqual(view.layout);
    expect(back.filters, view.id).toEqual(filters);
    expect(isEdited(back.view, back.filters, on(view.source)), view.id).toBe(
      false,
    );

    const other = switchLayout(
      state.shape,
      state.shape.type === "pivot" ? "chart" : "pivot",
      on(view.source),
      view,
    );
    const edited = changeView(state, other);
    const made = open(link(edited, filters, view.source), view.source);
    expect(made.view.view, view.id).toBe(view.id);
    expect(made.view.shape, view.id).toEqual(other);
    expect(differences(made.view, made.filters, on(view.source))).toEqual([
      "layout",
    ]);
  }
});

test("a view links by its id and what differs alone, and a page's first by nothing", () => {
  const history = opening(VIEWS.find((v) => v.id === "history")!);
  expect(link(history, clearedState("all"), "articles")).toBe("?view=history");
  const all = viewAt("", "articles");
  expect(all.view).toBe("all");
  expect(link(all, clearedState("3m"), "articles")).toBe("?");

  /* one setting changed is one setting in the link */
  if (history.shape.type !== "chart") throw new Error("History is a chart");
  const lines = changeView(history, {
    type: "chart",
    chart: { ...history.shape.chart, draw: "lines" },
  });
  expect(link(lines, clearedState("all"), "articles")).toBe(
    "?view=history&layout=chart&draw=lines",
  );
});

test("a link opens on the view as it is saved now, with its changes on top", () => {
  const history = VIEWS.find((v) => v.id === "history")!;
  const before = on("articles");
  const params = new URLSearchParams();
  if (history.layout.type !== "chart") throw new Error("History is a chart");
  writeView(
    changeView(opening(history), {
      type: "chart",
      chart: { ...history.layout.chart, draw: "lines" },
    }),
    params,
    before,
  );
  /* someone saves History by year since */
  const after = before.map((v) =>
    v.id === "history" && v.layout.type === "chart"
      ? {
          ...v,
          layout: {
            ...v.layout,
            chart: { ...v.layout.chart, by: "year" as const },
          },
        }
      : v,
  );
  const { state } = readView(`?${params}`, after, "articles");
  expect(state.shape).toMatchObject({
    type: "chart",
    chart: { by: "year", draw: "lines" },
  });
});

test("a link to a view the page no longer has says so, and opens the first as saved", () => {
  const read = readView(
    "?view=gone&layout=chart&count=people&range=12m",
    on("articles"),
    "articles",
  );
  expect(read.missing).toBe("gone");
  expect(read.state).toEqual(opening(on("articles")[0]!));
  /* another page's view is not this page's */
  expect(readView("?view=headcount", on("articles"), "articles").missing).toBe(
    "headcount",
  );
});

test("an old Custom link opens the view it was made from, with its changes", () => {
  const custom = viewAt(
    "?view=custom&base=headcount&layout=chart&count=people&by=year&split=none&draw=lines&values=number&order=largest&top=25&compare=none",
    "people",
  );
  expect(custom.view).toBe("headcount");
  expect(custom.shape).toMatchObject({ type: "chart", chart: { by: "year" } });
  /* with no base, it was made from the page's first */
  expect(
    viewAt("?view=custom&layout=table&columns=name", "people"),
  ).toMatchObject({
    view: "everyone",
    shape: { type: "table", columns: ["name"] },
  });
  /* and the link it is rewritten to names no Custom */
  expect(link(custom, clearedState("all"), "people")).not.toContain("custom");
  expect(link(custom, clearedState("all"), "people")).not.toContain("base");
});

test("a link to a view merged into another opens the one it became", () => {
  expect(viewAt("?view=contributors", "people").view).toBe("top");
  expect(viewAt("?view=newcomers", "people").view).toBe("new");
  expect(
    viewAt("?view=custom&base=newcomers&layout=table&columns=name", "people")
      .view,
  ).toBe("new");
});

test("whatever differs from the view as saved is an edit, and Reset takes it all back", () => {
  const views = on("people");
  const everyone = opening(views[0]!);
  const filters = openingOf(views[0]!);
  expect(differences(everyone, filters, views)).toEqual([]);

  const changed: ViewState = {
    ...everyone,
    sort: { id: "name", desc: false },
    minimum: 5,
  };
  const narrowed: FilterState = {
    ...filters,
    preset: "12m",
    sections: ["News"],
    people: ["Ada Example"],
    articles: [3],
    search: "ada",
  };
  expect(differences(changed, narrowed, views)).toEqual([
    "range",
    "sections",
    "people",
    "articles",
    "search",
    "sort",
    "minimum",
  ]);
  expect(resetView(changed, views)).toEqual(everyone);

  /* a sort held while a chart shows is not on screen to differ */
  const chart = changeView(
    changed,
    switchLayout(changed.shape, "chart", views, views[0]!),
  );
  expect(differences(chart, filters, views)).toEqual(["layout"]);

  /* a new view is something to save, before anything changes */
  const fresh = openingState(savedOf(views, NEW), views);
  expect(fresh.view).toBe(NEW);
  expect(differences(fresh, filters, views)).toEqual([]);
  expect(isEdited(fresh, filters, views)).toBe(true);
});

test("a table's sort is the view's own until changed, and each view opens on its own", () => {
  const everyone = viewAt("", "people");
  expect(everyone.sort).toEqual({ id: "contributions", desc: true });
  const byName = { ...everyone, sort: { id: "name" as const, desc: false } };
  expect(link(byName, clearedState("3m"), "people")).toBe("?sort=name");
  expect(viewAt("?view=new", "people").sort).toEqual({
    id: "first",
    desc: true,
  });
});

/* what the builder offers for a chart setting now, as its rows do */
function offered(chart: ChartConfig, key: keyof ChartConfig, value: unknown) {
  const ok = allows(chart);
  if (key === "order") return ok.order;
  if (key === "top") return ok.top;
  return (ok[key] as Record<string, boolean>)[String(value)] ?? false;
}

/* how a chart is drawn before what it counts: Order is offered only while
   the axis is not time, so a person sets it first, as this does */
const SETTINGS: (keyof ChartConfig)[] = [
  "order",
  "top",
  "draw",
  "values",
  "count",
  "by",
  "split",
  "compare",
];

/* the same for a pivot's */
function offeredPivot(
  pivot: PivotConfig,
  key: keyof PivotConfig,
  value: unknown,
) {
  const ok = allowsPivot(pivot);
  if (key === "top") return ok.top;
  return (ok[key] as Record<string, boolean>)[String(value)] ?? false;
}

/* what is counted before what it is cut by, which can rule a count out */
const PIVOT_SETTINGS: (keyof PivotConfig)[] = [
  "values",
  "top",
  "count",
  "rows",
  "columns",
  "compare",
];

/* the declaration's settings made one at a time, each as the builder offers
   it, from a table of one column on all time */
function rebuild(view: View) {
  const { source } = view;
  const views = on(source);
  const [starter] = COLUMNS[source];
  let state: ViewState = {
    ...opening(views[0]!),
    shape: { type: "table", columns: [starter] },
    sort: { id: starter, desc: false },
  };
  let filters = clearedState("all");
  const shape = () => state.shape;

  state = changeView(
    state,
    switchLayout(shape(), view.layout.type, views, view),
  );
  const { layout } = view;
  if (layout.type === "table") {
    const wanted: readonly ColumnId[] = layout.table.columns;
    let columns = (shape() as Extract<Shape, { type: "table" }>).columns;
    for (const id of wanted) columns = withColumn(columns, id, true);
    for (const id of columns)
      if (!wanted.includes(id)) columns = withColumn(columns, id, false);
    /* each column moved up until it is where the view has it */
    for (const [at, id] of wanted.entries())
      while (columns.indexOf(id) > at) columns = moveColumn(columns, id, -1);
    state = changeView(state, { type: "table", columns });
    if ("only" in layout.table && layout.table.only)
      state = changeView(state, {
        type: "table",
        columns,
        only: layout.table.only,
      });
    state = { ...state, sort: { ...state.sort, id: layout.table.sort.id } };
    state = { ...state, sort: { ...state.sort, desc: layout.table.sort.desc } };
    /* People's Show, in the toolbar */
    if ("minimum" in layout.table && layout.table.minimum)
      state = { ...state, minimum: layout.table.minimum };
  } else if (layout.type === "pivot") {
    let pivot = (shape() as Extract<Shape, { type: "pivot" }>).pivot;
    for (let pass = 0; pass < 5; pass++)
      for (const key of PIVOT_SETTINGS)
        if (
          pivot[key] !== layout.pivot[key] &&
          offeredPivot(pivot, key, layout.pivot[key])
        )
          pivot = { ...pivot, [key]: layout.pivot[key] };
    state = changeView(state, { type: "pivot", pivot });
  } else {
    let chart = (shape() as Extract<Shape, { type: "chart" }>).chart;
    for (let pass = 0; pass < 5; pass++)
      for (const key of SETTINGS)
        if (
          chart[key] !== layout.chart[key] &&
          offered(chart, key, layout.chart[key])
        )
          chart = { ...chart, [key]: layout.chart[key] };
    state = changeView(state, { type: "chart", chart });
    /* the legend's series, each clicked off */
    for (const key of layout.hidden ?? [])
      state = { ...state, hidden: [...state.hidden, key] };
  }

  filters = { ...filters, preset: view.range };
  for (const key of ["sections", "roles", "people"] as const)
    filters = { ...filters, [key]: [...(view.filters?.[key] ?? [])] };
  return declarationOf({ ...state, view: view.id }, filters, views);
}

test("every view can be built from nothing in the builder, and saves as declared", () => {
  for (const view of ALL) {
    const { view: made, left } = rebuild(view);
    expect(left, view.id).toEqual([]);
    expect(made, view.id).toEqual(view);
  }
});

test("a save says what a view cannot keep, and keeps the rest", () => {
  const views = on("articles");
  const { view, left } = declarationOf(
    opening(views[0]!),
    {
      ...clearedState("custom"),
      from: "2025-06-01",
      to: "2025-12-31",
      search: "moon",
      articles: [4, 5],
    },
    views,
  );
  expect(view.range).toBe("3m");
  expect(left).toEqual([
    "the range of dates (2025-06-01 to 2025-12-31): a view opens on one counted from today",
    "the search for “moon”",
    "the 2 articles a chart's mark chose",
  ]);
});

test("a link to the old Charts page opens its view on that view's page", () => {
  expect(chartsAddress("")).toBe("/articles?view=sections");
  expect(chartsAddress("?view=headcount&range=12m&slice=2026-1")).toBe(
    "/people?view=headcount&range=12m&slice=2026-1",
  );
  expect(chartsAddress("?view=custom&base=headcount&count=people")).toBe(
    "/people?view=custom&base=headcount&count=people",
  );
  /* Contributors and Newcomers are People's merged views now */
  expect(chartsAddress("?view=contributors&range=12m")).toBe(
    "/people?view=top&range=12m",
  );
  expect(chartsAddress("?view=custom&base=newcomers")).toBe(
    "/people?view=custom&base=new",
  );
  /* Mix went before Headcount came; it opens the first chart */
  expect(chartsAddress("?view=mix")).toBe("/articles?view=sections");
  /* and each lands on the view it named */
  for (const view of VIEWS)
    if (view.layout.type === "chart") {
      const to = new URL(chartsAddress(`?view=${view.id}`), "https://x.test");
      expect(to.pathname).toBe(`/${view.source}`);
      expect(viewAt(to.search, view.source).view).toBe(view.id);
    }
});

test("a list of new people switched to a chart or a pivot counts new people", () => {
  const views = on("people");
  const newPeople = savedOf(views, "new");
  const fresh = opening(newPeople).shape;
  const chart = switchLayout(fresh, "chart", views, newPeople);
  expect(chart.type === "chart" && chart.chart).toMatchObject({
    count: "newcomers",
    by: "section",
    split: "role",
  });
  const pivot = switchLayout(fresh, "pivot", views, newPeople);
  expect(pivot.type === "pivot" && pivot.pivot).toMatchObject({
    count: "newcomers",
    rows: "section",
    columns: "role",
  });
  /* everyone, as the page's first chart */
  const first = switchLayout(
    opening(views[0]!).shape,
    "chart",
    views,
    views[0]!,
  );
  expect(first.type === "chart" && first.chart.count).toBe("contributions");
});

test("a view opens with its own series off and its own Show, and a link can undo either", () => {
  const history = viewAt("?view=news-history", "articles");
  expect(history.hidden).toEqual(["Sports"]);
  const all = { ...history, hidden: [] };
  expect(link(all, clearedState("all"), "articles")).toContain("hide=");
  expect(
    viewAt(link(all, clearedState("all"), "articles"), "articles").hidden,
  ).toEqual([]);

  const regulars = viewAt("?view=regulars", "people");
  expect(regulars.minimum).toBe(3);
  const everyone = { ...regulars, minimum: 1 as const };
  expect(
    viewAt(link(everyone, clearedState("semester"), "people"), "people")
      .minimum,
  ).toBe(1);
});

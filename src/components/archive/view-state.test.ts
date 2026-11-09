import { format } from "prettier";
import { expect, test, vi } from "vitest";
import { allows, type ChartConfig } from "./chart-config";
import { chartsAddress } from "./charts-address";
import {
  carryOver,
  clearedState,
  readState,
  writeState,
  type FilterState,
  type Preset,
} from "./filters";
import {
  changeView,
  chooseView,
  CUSTOM,
  declarationOf,
  layoutOf,
  moveColumn,
  openingOf,
  rangeOfView,
  readView,
  shapeOf,
  switchLayout,
  viewOf,
  viewsOn,
  viewSource,
  withColumn,
  writeView,
  type Shape,
  type ViewState,
} from "./view-state";
import { COLUMNS, VIEWS, type ColumnId, type Source, type View } from "./views";

/* every default view goes through these, and so do two that use what no
   default does yet: filters, a legend with series off, and People's Show */
vi.mock("./views", async (importOriginal) => {
  const real = await importOriginal<typeof import("./views")>();
  const extra = [
    {
      id: "news-history",
      label: "News history",
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
        },
        hidden: ["Sports"],
      },
    },
    {
      id: "regulars",
      label: "Regulars",
      question: "Who has done the most this semester?",
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
  return { ...real, VIEWS: [...real.VIEWS, ...extra] };
});

const SOURCES: Source[] = ["articles", "people"];

/** a page as it opens on a view: the view, then Time from it */
const open = (search: string, source: Source) => {
  const view = readView(search, source);
  return { view, filters: readState(search, rangeOfView(view, source)) };
};

const link = (state: ViewState, filters: FilterState, source: Source) => {
  const params = new URLSearchParams();
  writeView(state, params, source);
  writeState(filters, params, rangeOfView(state, source));
  return `?${params}`;
};

const opening = (view: View): ViewState =>
  readView(`?view=${view.id}`, view.source);

test("each page opens on a table, and every view is one its page can show", () => {
  const ids = VIEWS.map((view) => view.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).not.toContain(CUSTOM);
  for (const source of SOURCES) {
    const [first] = viewsOn(source);
    expect(first?.layout.type, source).toBe("table");
  }
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

test("every view opens from its link as declared, and as Custom", () => {
  for (const view of VIEWS) {
    const state = opening(view);
    const filters = openingOf(state, view.source);
    const back = open(link(state, filters, view.source), view.source);
    expect(back.view.view, view.id).toBe(view.id);
    expect(layoutOf(back.view, view.source), view.id).toEqual(view.layout);
    expect(back.filters, view.id).toEqual(filters);

    const custom = changeView(state, shapeOf(state, view.source), view.source);
    const made = open(link(custom, filters, view.source), view.source);
    expect(made.view.view, view.id).toBe(CUSTOM);
    expect(made.view.base, view.id).toBe(view.id);
    expect(layoutOf(made.view, view.source), view.id).toEqual(view.layout);
  }
});

test("a view links by name alone, and a page's first by nothing", () => {
  const history = opening(VIEWS.find((v) => v.id === "history")!);
  expect(link(history, clearedState("all"), "articles")).toBe("?view=history");
  const all = readView("", "articles");
  expect(all.view).toBe("all");
  expect(link(all, clearedState("3m"), "articles")).toBe("?");

  /* a view no longer offered, or another page's, opens the page's first */
  expect(readView("?view=mix", "articles").view).toBe("all");
  expect(readView("?view=headcount", "articles").view).toBe("all");
});

test("a link reproduces a custom chart or table, and keeps the filters' parameters", () => {
  const chart: ChartConfig = {
    count: "newcomers",
    by: "school-year",
    split: "role",
    draw: "lines",
    values: "running",
    order: "largest",
    top: 25,
  };
  const people = changeView(
    readView("?view=headcount", "people"),
    { type: "chart", chart },
    "people",
  );
  const params = new URLSearchParams("range=semester&q=ann");
  writeView(people, params, "people");
  const back = readView(`?${params}`, "people");
  expect(shapeOf(back, "people")).toEqual({ type: "chart", chart });
  expect(back.base).toBe("headcount");
  expect(params.get("q")).toBe("ann");

  const table = changeView(
    readView("", "people"),
    { type: "table", columns: ["first", "name"] },
    "people",
  );
  const again = readView(link(table, clearedState("3m"), "people"), "people");
  expect(shapeOf(again, "people")).toEqual({
    type: "table",
    columns: ["first", "name"],
  });

  /* a Custom link from before tables is a chart */
  expect(
    shapeOf(
      readView("?view=custom&count=articles&by=semester", "articles"),
      "articles",
    ).type,
  ).toBe("chart");
});

test("a link keeps the series the legend has off", () => {
  const history = {
    ...readView("?view=history", "articles"),
    hidden: ["News", "Sports"],
  };
  const params = new URLSearchParams();
  writeView(history, params, "articles");
  expect(params.get("hide")).toBe("News,Sports");
  expect(readView(`?${params}`, "articles").hidden).toEqual(["News", "Sports"]);
});

test("a link leaves out the view's own time range, and keeps any other", () => {
  const history = readView("?view=history", "articles");
  const time = (search: string) => open(search, "articles").filters.preset;
  expect(link(history, clearedState("all"), "articles")).toBe("?view=history");
  expect(time("?view=history")).toBe("all");
  expect(time("?view=sections")).toBe("3m");

  /* Time changed after choosing a view is a filter, and the view stays */
  const narrowed = open(
    link(history, clearedState("12m"), "articles"),
    "articles",
  );
  expect(narrowed.view.view).toBe("history");
  expect(narrowed.filters.preset).toBe("12m");

  /* Custom keeps the range of the view it was made from */
  const custom = changeView(
    readView("?view=headcount", "people"),
    { type: "table", columns: ["name"] },
    "people",
  );
  expect(rangeOfView(custom, "people")).toBe<Preset>("all");
  expect(
    new URLSearchParams(link(custom, clearedState("all"), "people")).has(
      "range",
    ),
  ).toBe(false);
});

test("a table's sort is the view's own until changed, and a change stands", () => {
  const everyone = readView("", "people");
  expect(everyone.sort).toEqual({ id: "contributions", desc: true });
  expect(link(everyone, clearedState("3m"), "people")).toBe("?");

  const byName = { ...everyone, sort: { id: "name" as const, desc: false } };
  expect(link(byName, clearedState("3m"), "people")).toBe("?sort=name");
  /* a chart holds it for the table after, and so does its link */
  const chart = chooseView(byName, "contributors", "people");
  const held = link(chart, clearedState("3m"), "people");
  expect(held).toBe("?view=contributors&sort=name");
  expect(chooseView(chart, "everyone", "people").sort).toEqual(byName.sort);
  expect(
    chooseView(readView(held, "people"), "everyone", "people").sort,
  ).toEqual(byName.sort);
  /* unchanged, each view opens on its own */
  expect(
    chooseView(
      chooseView(everyone, "contributors", "people"),
      "everyone",
      "people",
    ).sort,
  ).toEqual(everyone.sort);
});

test("a view opens on its own filters, unless they have been changed", () => {
  const from = { ...clearedState("3m"), roles: ["writer" as const] };
  const to = { ...clearedState("all"), sections: ["News"] };
  /* untouched: the next view's own */
  expect(carryOver(from, from, to)).toEqual(to);
  /* Time and a typed search were changed, so they stand */
  const changed = { ...from, preset: "12m" as const, search: "ada" };
  expect(carryOver(changed, from, to)).toEqual({
    ...to,
    preset: "12m",
    search: "ada",
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
];

/* the declaration's settings made one at a time, each as the builder offers
   it, from a Custom table of one column on all time */
function rebuild(view: View) {
  const { source } = view;
  const [starter] = COLUMNS[source];
  let state: ViewState = {
    ...readView("", source),
    view: CUSTOM,
    custom: { type: "table", columns: [starter] },
    sort: { id: starter, desc: false },
  };
  let filters = clearedState("all");
  const shape = () => shapeOf(state, source);

  state = changeView(
    state,
    switchLayout(shape(), view.layout.type, source),
    source,
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
    state = changeView(state, { type: "table", columns }, source);
    state = { ...state, sort: { ...state.sort, id: layout.table.sort.id } };
    state = { ...state, sort: { ...state.sort, desc: layout.table.sort.desc } };
    /* People's Show, in the toolbar */
    if ("minimum" in layout.table && layout.table.minimum)
      state = { ...state, minimum: layout.table.minimum };
  } else {
    let chart = (shape() as Extract<Shape, { type: "chart" }>).chart;
    for (let pass = 0; pass < 5; pass++)
      for (const key of SETTINGS)
        if (
          chart[key] !== layout.chart[key] &&
          offered(chart, key, layout.chart[key])
        )
          chart = { ...chart, [key]: layout.chart[key] };
    state = changeView(state, { type: "chart", chart }, source);
    /* the legend's series, each clicked off */
    for (const key of layout.hidden ?? [])
      state = { ...state, hidden: [...state.hidden, key] };
  }

  filters = { ...filters, preset: view.range };
  for (const key of ["sections", "roles", "people"] as const)
    filters = { ...filters, [key]: [...(view.filters?.[key] ?? [])] };
  return declarationOf(state, filters, source);
}

const WORDS = {
  id: "new-view",
  label: "New view",
  question: "What does it answer?",
};

test("every default view can be built from nothing in the builder", () => {
  for (const view of VIEWS) {
    const { view: made, left } = rebuild(view);
    expect(left, view.id).toEqual([]);
    expect(made, view.id).toEqual({ ...view, ...WORDS });
  }
});

test("Copy as view writes a default as it is declared, ready to paste", async () => {
  for (const view of VIEWS) {
    const state = opening(view);
    const { view: copied, left } = declarationOf(
      state,
      openingOf(state, view.source),
      view.source,
    );
    expect(copied, view.id).toEqual(view);
    expect(left).toEqual([]);

    const text = viewSource(copied);
    /* what the paste means: the same declaration */
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- reads back our own output
    const pasted: unknown = new Function(
      `return ${text.trim().replace(/,$/, "")}`,
    )();
    expect(pasted, view.id).toEqual(view);
    /* and how it reads: as views.ts is formatted, so it passes the check */
    const file = `export const VIEWS = [\n${text}];\n`;
    expect(await format(file, { parser: "typescript" }), view.id).toBe(file);
  }
});

test("Copy as view says what a view cannot keep", () => {
  const state = readView("", "articles");
  const { view, left } = declarationOf(
    state,
    {
      ...clearedState("custom"),
      from: "2025-06-01",
      to: "2025-12-31",
      search: "moon",
    },
    "articles",
  );
  expect(view.range).toBe("3m");
  expect(left).toHaveLength(2);
  expect(viewSource(view, left)).toMatch(/^ {2}\/\/ not kept: the range/);
});

test("a link to the old Charts page opens its view on that view's page", () => {
  expect(chartsAddress("")).toBe("/articles?view=sections");
  expect(chartsAddress("?view=headcount&range=12m&slice=2026-1")).toBe(
    "/people?view=headcount&range=12m&slice=2026-1",
  );
  expect(chartsAddress("?view=custom&base=contributors&count=people")).toBe(
    "/people?view=custom&base=contributors&count=people",
  );
  /* Mix went before Headcount came; it opens the first chart */
  expect(chartsAddress("?view=mix")).toBe("/articles?view=sections");
  /* and each lands on the view it named */
  for (const view of VIEWS)
    if (view.layout.type === "chart") {
      const to = new URL(chartsAddress(`?view=${view.id}`), "https://x.test");
      expect(to.pathname).toBe(`/${view.source}`);
      expect(viewOf(readView(to.search, view.source), view.source).id).toBe(
        view.id,
      );
    }
});

test("Copy as view keeps the legend's series off, People's Show and the Columns menu", () => {
  const history = {
    ...readView("?view=history", "articles"),
    hidden: ["News"],
  };
  const chart = declarationOf(history, clearedState("all"), "articles");
  expect(chart.view.layout).toMatchObject({ type: "chart", hidden: ["News"] });

  const everyone = { ...readView("", "people"), minimum: 5 as const };
  const table = declarationOf(everyone, clearedState("3m"), "people", ["last"]);
  expect(table.view.layout).toEqual({
    type: "table",
    table: {
      columns: ["name", "contributions", "writer", "image", "other", "first"],
      sort: { id: "contributions", desc: true },
      minimum: 5,
    },
  });
  expect(table.left).toEqual([]);
});

test("a view opens with its own series off and its own Show, and a link can undo either", () => {
  const history = readView("?view=news-history", "articles");
  expect(history.hidden).toEqual(["Sports"]);
  expect(
    new URLSearchParams(
      link(history, openingOf(history, "articles"), "articles"),
    ).has("hide"),
  ).toBe(false);
  /* every series on, where the view has one off */
  const all = { ...history, hidden: [] };
  expect(
    readView(link(all, clearedState("all"), "articles"), "articles").hidden,
  ).toEqual([]);

  const regulars = readView("?view=regulars", "people");
  expect(regulars.minimum).toBe(3);
  const everyone = { ...regulars, minimum: 1 as const };
  expect(
    readView(link(everyone, clearedState("semester"), "people"), "people")
      .minimum,
  ).toBe(1);
  /* changed, it stands on the next view, as a sort does */
  expect(chooseView(everyone, "everyone", "people").minimum).toBe(1);
  expect(chooseView(regulars, "everyone", "people").minimum).toBe(1);
  expect(
    chooseView({ ...regulars, minimum: 5 }, "everyone", "people").minimum,
  ).toBe(5);
});

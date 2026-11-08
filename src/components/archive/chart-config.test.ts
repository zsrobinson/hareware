import { expect, test } from "vitest";
import {
  configOf,
  rangeOfView,
  readChart,
  settle,
  VIEWS,
  writeChart,
  type ChartConfig,
  type ChartState,
} from "./chart-config";
import { clearedState, readState, writeState, type Preset } from "./filters";

const roundTrip = (state: ChartState) => {
  const params = new URLSearchParams("range=semester&q=ann");
  writeChart(state, params);
  return { params, state: readChart(`?${params}`) };
};

test("every saved view is a configuration the builder could have made", () => {
  for (const view of VIEWS) expect(settle(view.config)).toEqual(view.config);
});

test("a link reproduces a custom chart, and keeps the filters' parameters", () => {
  const custom: ChartConfig = {
    count: "newcomers",
    by: "school-year",
    split: "role",
    draw: "lines",
    values: "running",
    order: "largest",
    top: 25,
  };
  const { params, state } = roundTrip({
    view: "custom",
    custom,
    base: "headcount",
    hidden: [],
  });
  expect(configOf(state)).toEqual(custom);
  expect(state.base).toBe("headcount");
  expect(params.get("range")).toBe("semester");
  expect(params.get("q")).toBe("ann");
});

test("a saved view links by name alone, and the default by nothing", () => {
  const saved = roundTrip({
    view: "headcount",
    custom: VIEWS[0].config,
    base: "headcount",
    hidden: [],
  });
  expect([...saved.params.keys()].sort()).toEqual(["q", "range", "view"]);
  expect(saved.state.view).toBe("headcount");

  const first = roundTrip({
    view: VIEWS[0].id,
    custom: null,
    base: VIEWS[0].id,
    hidden: [],
  });
  expect(first.params.has("view")).toBe(false);

  /* a view no longer offered opens the first one */
  expect(readChart("?view=mix").view).toBe(VIEWS[0].id);
});

test("a link keeps the series the legend has off", () => {
  const { params, state } = roundTrip({
    view: "history",
    custom: null,
    base: "history",
    hidden: ["News", "Sports"],
  });
  expect(params.get("hide")).toBe("News,Sports");
  expect(state.hidden).toEqual(["News", "Sports"]);
  expect(roundTrip({ ...state, hidden: [] }).params.has("hide")).toBe(false);
});

test("a link leaves out the view's own time range, and keeps any other", () => {
  const link = (chart: ChartState, preset: Preset) => {
    const params = new URLSearchParams();
    writeChart(chart, params);
    writeState(clearedState(preset), params, rangeOfView(chart));
    return `?${params}`;
  };
  /* as the page opens one: the chart first, then Time from its view */
  const open = (search: string) => {
    const chart = readChart(search);
    return { view: chart.view, time: readState(search, rangeOfView(chart)) };
  };
  const history: ChartState = {
    view: "history",
    custom: null,
    base: "history",
    hidden: [],
  };
  const contributors: ChartState = {
    view: "contributors",
    custom: null,
    base: "contributors",
    hidden: [],
  };

  expect(link(history, "all")).toBe("?view=history");
  expect(open("?view=history").time.preset).toBe("all");
  expect(link(contributors, "3m")).toBe("?view=contributors");
  expect(open("?view=contributors").time.preset).toBe("3m");

  /* Time changed after choosing a view is a filter, and the view stays */
  const narrowed = open(link(history, "12m"));
  expect(narrowed).toMatchObject({ view: "history", time: { preset: "12m" } });

  /* Custom keeps the range of the view it was made from */
  const custom: ChartState = {
    view: "custom",
    custom: { ...VIEWS[0].config, values: "share" },
    base: "headcount",
    hidden: [],
  };
  expect(rangeOfView(custom)).toBe(open("?view=headcount").time.preset);
  expect(new URLSearchParams(link(custom, "all")).has("range")).toBe(false);
  expect(open(link(custom, "12m")).time.preset).toBe("12m");
});

test("a hand-edited link is settled rather than drawn as asked", () => {
  const state = readChart(
    "?view=custom&count=people&by=section&split=section&draw=lines&values=share&order=largest&top=7",
  );
  expect(configOf(state)).toEqual({
    count: "people",
    by: "section",
    split: "none",
    draw: "stacked",
    values: "number",
    order: "largest",
    top: 25,
  });
  expect(readChart("?view=nonsense").view).toBe(VIEWS[0].id);
});

test("a choice that rules another out moves it", () => {
  const base: ChartConfig = {
    count: "articles",
    by: "semester",
    split: "section",
    draw: "stacked",
    values: "number",
    order: "largest",
    top: 25,
  };
  /* people overlap across sections, so they are not stacked or shared out */
  expect(settle({ ...base, count: "people" }).draw).toBe("grouped");
  expect(settle({ ...base, count: "people", values: "share" }).values).toBe(
    "number",
  );
  /* an article has no one role */
  expect(settle({ ...base, split: "role" }).count).toBe("contributions");
  /* lines and running totals need a time axis */
  expect(
    settle({ ...base, draw: "lines", values: "running", by: "person" }),
  ).toMatchObject({
    draw: "stacked",
    values: "number",
    count: "contributions",
  });
});

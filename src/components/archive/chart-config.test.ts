import { expect, test } from "vitest";
import {
  configOf,
  readChart,
  settle,
  VIEWS,
  writeChart,
  type ChartConfig,
  type ChartState,
} from "./chart-config";

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
  const { params, state } = roundTrip({ view: "custom", custom, base: "mix" });
  expect(configOf(state)).toEqual(custom);
  expect(state.base).toBe("mix");
  expect(params.get("range")).toBe("semester");
  expect(params.get("q")).toBe("ann");
});

test("a saved view links by name alone, and the default by nothing", () => {
  const mix = roundTrip({ view: "mix", custom: VIEWS[0].config, base: "mix" });
  expect([...mix.params.keys()].sort()).toEqual(["q", "range", "view"]);
  expect(mix.state.view).toBe("mix");

  const first = roundTrip({
    view: "over-time",
    custom: null,
    base: "over-time",
  });
  expect(first.params.has("view")).toBe(false);
});

test("a hand-edited link is settled rather than drawn as asked", () => {
  const state = readChart(
    "?view=custom&count=people&by=section&split=section&draw=lines&values=share&top=7",
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
  expect(readChart("?view=nonsense").view).toBe("over-time");
});

test("a choice that rules another out moves it", () => {
  const base = VIEWS[0].config;
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

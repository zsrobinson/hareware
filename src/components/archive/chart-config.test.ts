import { expect, test } from "vitest";
import {
  allows,
  COUNTS,
  DRAWS,
  GROUPINGS,
  readChart,
  settle,
  SPLITS,
  type ChartConfig,
} from "./chart-config";
import { VIEWS } from "./views";

const sections = (() => {
  const { layout } = VIEWS.find((view) => view.id === "sections")!;
  if (layout.type !== "chart") throw new Error("Sections is a chart");
  return layout.chart;
})();

test("every saved chart is a configuration the builder could have made", () => {
  for (const view of VIEWS)
    if (view.layout.type === "chart")
      expect(settle(view.layout.chart), view.id).toEqual(view.layout.chart);
});

test("a hand-edited link is settled rather than drawn as asked", () => {
  const chart = readChart(
    new URLSearchParams(
      "count=people&by=section&split=section&draw=lines&values=share&order=largest&top=7",
    ),
    sections,
  );
  expect(chart).toEqual({
    count: "people",
    by: "section",
    split: "none",
    draw: "stacked",
    values: "number",
    order: "largest",
    top: 25,
    compare: "none",
  });
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
    compare: "none",
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

test("no choice in the builder moves what is counted, grouped or split", () => {
  /* Articles by section: an article has no one role or person */
  const ok = allows(sections);
  expect(ok.split.role).toBe(false);
  expect(ok.by.person).toBe(false);
  expect(ok.by.role).toBe(false);
  expect(ok.by.semester).toBe(true);

  const settings = {
    count: COUNTS.map((c) => c.id),
    by: GROUPINGS.map((g) => g.id),
    split: SPLITS.map((s) => s.id),
  };
  const configs = settings.count.flatMap((count) =>
    settings.by.flatMap((by) =>
      settings.split.flatMap((split) =>
        DRAWS.map((draw) => settle({ ...sections, count, by, split, draw })),
      ),
    ),
  );
  for (const config of configs) {
    const offered = allows(config);
    for (const key of ["count", "by", "split"] as const)
      for (const option of settings[key]) {
        if (!(offered[key] as Record<string, boolean>)[option]) continue;
        const next = settle({ ...config, [key]: option });
        expect(
          { count: next.count, by: next.by, split: next.split },
          `${JSON.stringify(config)} → ${key} ${option}`,
        ).toEqual({
          count: config.count,
          by: config.by,
          split: config.split,
          [key]: option,
        });
      }
  }
});

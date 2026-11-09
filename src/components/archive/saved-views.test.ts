import { expect, test } from "vitest";
import type { SheetPayload } from "~/lib/credits/load";
import type { ViewRow } from "~/lib/credits/sheet";
import { pageViews, readRow, starterOf, storedOf } from "./saved-views";
import { VIEWS, type View } from "./views";

/* invented names only: what the Sheet holds is private */

const rowOf = (
  view: View,
  row: number,
  extra: Partial<ViewRow> = {},
): ViewRow => ({
  row,
  id: view.id,
  page: view.source,
  position: String(row),
  view: JSON.stringify(storedOf(view).view),
  updatedBy: "Riley Real",
  updatedAt: `T${row}`,
  ...extra,
});

const sheet = (views: ViewRow[]): SheetPayload => ({
  sheet: {
    status: "read",
    overrides: [],
    unscoped: [],
    ignored: [],
    labels: null,
    views,
    problems: [],
    tabs: { overrides: true, labels: true, ignored: true, views: true },
  },
});

const all = VIEWS.find((v) => v.id === "all")! as View;
const history = VIEWS.find((v) => v.id === "history")! as View;

test("every starter view is stored and read back as it is declared", () => {
  for (const view of VIEWS)
    expect(readRow(rowOf(view as View, 2), view.source), view.id).toEqual(view);
});

test("a page with no rows shows its starter set; one with rows, its rows in order", () => {
  expect(pageViews(sheet([]), "articles")).toMatchObject({ status: "starter" });
  expect(pageViews(sheet([]), "articles").views).toEqual(starterOf("articles"));

  const page = pageViews(
    sheet([
      rowOf(history, 2, { position: "1" }),
      rowOf(all, 3, { position: "2" }),
      rowOf(VIEWS.find((v) => v.id === "top")! as View, 4),
    ]),
    "articles",
  );
  expect(page.status).toBe("saved");
  expect(page.views.map((s) => [s.view.id, s.updatedBy, s.updatedAt])).toEqual([
    ["history", "Riley Real", "T2"],
    ["all", "Riley Real", "T3"],
  ]);
});

test("a row that cannot be read is listed with why, and the rest still show", () => {
  const broken = (row: number, extra: Partial<ViewRow>) =>
    rowOf(all, row, { id: `x${row}`, ...extra });
  const stored = storedOf(history).view;
  const page = pageViews(
    sheet([
      rowOf(all, 2),
      broken(3, { view: "{not json" }),
      broken(4, { view: JSON.stringify({ ...stored, v: 2 }) }),
      broken(5, {
        view: JSON.stringify({
          ...stored,
          layout: {
            type: "chart",
            chart: {
              ...(stored.layout as { chart: object }).chart,
              draw: "pie",
            },
          },
        }),
      }),
      broken(6, { view: JSON.stringify({ ...stored, colour: "red" }) }),
      broken(7, { position: "first" }),
      rowOf(all, 8),
    ]),
    "articles",
  );

  expect(page.views.map((s) => s.view.id)).toEqual(["all"]);
  expect(page.unreadable).toEqual([
    { row: 3, id: "x3", reason: "its view isn't JSON" },
    { row: 4, id: "x4", reason: "its view is version 2, and HareWare reads 1" },
    {
      row: 5,
      id: "x5",
      reason: "its chart's draw “pie” isn't one HareWare can show",
    },
    {
      row: 6,
      id: "x6",
      reason: "it has “colour”, which HareWare doesn't read",
    },
    { row: 7, id: "x7", reason: "its position must be a number" },
    { row: 8, id: "all", reason: "another row has its id" },
  ]);
});

test("a page none of whose rows can be read shows its starter set, with saving off", () => {
  const page = pageViews(
    sheet([rowOf(all, 2, { view: "nonsense" })]),
    "articles",
  );
  expect(page.status).toBe("unsaved");
  expect(page.views).toEqual(starterOf("articles"));
  expect(page.unreadable).toHaveLength(1);
});

test("a Sheet that cannot be read shows the starter set, says so, and saves nothing", () => {
  const page = pageViews(
    { sheet: { status: "failed", reason: "google sheets answered 403" } },
    "people",
  );
  expect(page).toMatchObject({ status: "unsaved", views: starterOf("people") });
  expect(page.status === "unsaved" && page.reason).toContain(
    "google sheets answered 403",
  );
});

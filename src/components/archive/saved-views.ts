/*
  A page's views as the board keeps them: the rows of the Sheet's Views tab,
  read and checked here, in the browser, by the same code that reads a view
  from a link (./chart-config, ./pivot-config). A page with no rows shows its
  starter set (./views) until someone first changes one (ADR 0015).
*/

import { useQuery } from "@tanstack/react-query";
import { isRole } from "~/lib/credits/labels";
import type { SheetPayload } from "~/lib/credits/load";
import {
  inOrder,
  type Page,
  type StoredView,
  type ViewRow,
} from "~/lib/credits/sheet";
import { CHART_PARAMS, readChart, type ChartConfig } from "./chart-config";
import { PRESETS } from "./filters";
import { PIVOT_PARAMS, readPivot, type PivotConfig } from "./pivot-config";
import { readSheetPayload, SHEET_KEY } from "./archive-data";
import { NEW } from "./view-state";
import {
  COLUMNS,
  MINIMUMS,
  VIEWS,
  type Layout,
  type Source,
  type View,
} from "./views";

/** the declaration format the Views tab holds; a row of another is not read */
export const VERSION = 1;

/** a view of the page, as saved, with who saved it and when */
export type Saved = {
  view: View;
  /** "" for a starter view, which nobody has saved */
  updatedAt: string;
  updatedBy: string;
  /** its place in the tab, which a deleted view is put back at */
  position: number;
};

/** a row of the Views tab that could not be read, and why */
export type Unreadable = { row: number; id: string; reason: string };

export type PageViews =
  /** the Views tab has no rows for the page: its starter set */
  | { status: "starter"; views: Saved[]; unreadable: Unreadable[] }
  /** the tab's rows for the page, in order */
  | { status: "saved"; views: Saved[]; unreadable: Unreadable[] }
  /** the starter set, with saving off, and why */
  | {
      status: "unsaved";
      views: Saved[];
      unreadable: Unreadable[];
      reason: string;
    };

/** a page's starter set: its views when the Views tab has none for it */
export const starterOf = (source: Source): Saved[] =>
  VIEWS.filter((view) => view.source === source).map((view, index) => ({
    view: view as View,
    updatedAt: "",
    updatedBy: "",
    position: index + 1,
  }));

/** a view as the Views tab stores it: its id and page are columns */
export function storedOf(view: View): StoredView {
  const { id, source: _source, ...rest } = view;
  return { id, view: { v: VERSION, ...rest } };
}

const KEYS = new Set([
  "v",
  "label",
  "title",
  "question",
  "range",
  "filters",
  "layout",
]);

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((x) => typeof x === "string");

/* the settings a link would carry, so a chart or a pivot is read as a link's */
function paramsOf(
  config: Record<string, unknown>,
  names: Record<string, string>,
) {
  const params = new URLSearchParams();
  for (const [key, name] of Object.entries(names))
    if (key in config) params.set(name, String(config[key]));
  return params;
}

const CHART_NAMES = Object.fromEntries(CHART_PARAMS.map((key) => [key, key]));

/* what a link would read the settings as must be the settings: anything
   the builder could not make, or that it would change, is not read */
function checked<T extends Record<string, unknown>>(
  raw: unknown,
  read: T,
  what: string,
): T | string {
  if (typeof raw !== "object" || raw === null) return `its ${what} is missing`;
  const given = raw as Record<string, unknown>;
  for (const key of Object.keys(given))
    if (!(key in read))
      return `its ${what} has “${key}”, which HareWare doesn't read`;
  for (const [key, value] of Object.entries(read))
    if (given[key] !== value)
      return given[key] === undefined
        ? `its ${what} has no ${key}`
        : `its ${what}'s ${key} ${JSON.stringify(given[key])} isn't one HareWare can show`;
  return read;
}

function layoutOf(raw: unknown, source: Source): Layout | string {
  if (typeof raw !== "object" || raw === null) return "it has no layout";
  const layout = raw as Record<string, unknown>;
  const fallback = <T extends Layout["type"]>(type: T) =>
    VIEWS.find((v) => v.layout.type === type)!.layout as Extract<
      Layout,
      { type: T }
    >;
  switch (layout.type) {
    case "chart": {
      const given = layout.chart as Record<string, unknown> | undefined;
      const chart = checked(
        given,
        readChart(paramsOf(given ?? {}, CHART_NAMES), fallback("chart").chart),
        "chart",
      );
      if (typeof chart === "string") return chart;
      if (layout.hidden !== undefined && !strings(layout.hidden))
        return "its hidden series aren't a list of names";
      return {
        type: "chart",
        chart: chart as ChartConfig,
        ...(layout.hidden ? { hidden: layout.hidden as string[] } : {}),
      };
    }
    case "pivot": {
      const given = layout.pivot as Record<string, unknown> | undefined;
      const pivot = checked(
        given,
        readPivot(paramsOf(given ?? {}, PIVOT_PARAMS), fallback("pivot").pivot),
        "pivot",
      );
      if (typeof pivot === "string") return pivot;
      return { type: "pivot", pivot: pivot as PivotConfig };
    }
    case "table": {
      const table = layout.table as Record<string, unknown> | undefined;
      if (!table) return "its table is missing";
      const all: readonly string[] = COLUMNS[source];
      const { columns, sort, minimum, only } = table;
      if (
        !strings(columns) ||
        columns.length === 0 ||
        new Set(columns).size !== columns.length ||
        columns.some((id) => !all.includes(id))
      )
        return `its columns must be some of ${all.join(", ")}`;
      const by = sort as { id?: unknown; desc?: unknown } | undefined;
      if (
        typeof by?.id !== "string" ||
        !all.includes(by.id) ||
        typeof by.desc !== "boolean"
      )
        return "its sort must be one of its columns, either way";
      if (source === "people") {
        if (minimum !== undefined && !MINIMUMS.includes(minimum as never))
          return `its minimum must be one of ${MINIMUMS.join(", ")}`;
        if (only !== undefined && only !== "new")
          return "only, where it is set, must be “new”";
      } else if (minimum !== undefined || only !== undefined)
        return "a table of articles has no minimum or only";
      return { type: "table", table: table as never };
    }
    default:
      return "its layout must be a table, a chart or a pivot";
  }
}

/** a row of the Views tab as a view of `source`, or why it cannot be one */
export function readRow(row: ViewRow, source: Source): View | string {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(row.id))
    return "its id must be lower-case letters, digits and hyphens";
  if (row.id === NEW) return `its id “${NEW}” is kept for a view not saved yet`;
  if (!Number.isFinite(Number(row.position)) || row.position === "")
    return "its position must be a number";
  let raw: unknown;
  try {
    raw = JSON.parse(row.view);
  } catch {
    return "its view isn't JSON";
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return "its view isn't a declaration";
  const view = raw as Record<string, unknown>;
  if (view.v !== VERSION)
    return `its view is version ${String(view.v)}, and HareWare reads ${VERSION}`;
  for (const key of Object.keys(view))
    if (!KEYS.has(key)) return `it has “${key}”, which HareWare doesn't read`;
  const { label, title, question, range, filters } = view;
  if (typeof label !== "string" || !label.trim()) return "it has no name";
  if (typeof title !== "string" || typeof question !== "string")
    return "its title and question must be words";
  if (
    typeof range !== "string" ||
    range === "custom" ||
    !PRESETS.some((p) => p.id === range)
  )
    return `its range “${String(range)}” isn't one HareWare offers`;
  if (filters !== undefined) {
    const f = filters as Record<string, unknown>;
    if (
      typeof f !== "object" ||
      f === null ||
      Object.keys(f).some(
        (k) => !["sections", "roles", "people"].includes(k),
      ) ||
      (f.sections !== undefined && !strings(f.sections)) ||
      (f.people !== undefined && !strings(f.people)) ||
      (f.roles !== undefined && !(strings(f.roles) && f.roles.every(isRole)))
    )
      return "its filters must be lists of sections, roles and people";
  }
  const layout = layoutOf(view.layout, source);
  if (typeof layout === "string") return layout;
  return {
    id: row.id,
    label: label.trim(),
    title,
    question,
    source,
    range,
    ...(filters ? { filters } : {}),
    layout,
  } as View;
}

/**
 * A page's views from the Sheet as read: the Views tab's rows for it in
 * order, or its starter set while it has none. A row that cannot be read is
 * listed, never dropped quietly; and a page none of whose rows can be read
 * shows its starter set, with saving off until Settings restores it.
 */
export function pageViews(
  payload: SheetPayload | undefined,
  source: Source,
): PageViews {
  const starter = starterOf(source);
  const sheet = payload?.sheet;
  if (!sheet || sheet.status !== "read")
    return {
      status: "unsaved",
      views: starter,
      unreadable: [],
      reason:
        sheet?.status === "failed"
          ? `The Sheet couldn't be read, so these are the starter views and can't be saved. ${sheet.reason}`
          : "The Sheet isn't connected, so these are the starter views and can't be saved.",
    };
  const rows = sheet.views.filter(
    (row) => row.page.trim().toLowerCase() === source,
  );
  const unreadable: Unreadable[] = [];
  const read: Saved[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    const view = readRow(row, source);
    const reason =
      typeof view === "string"
        ? view
        : ids.has(view.id)
          ? "another row has its id"
          : null;
    if (reason !== null) {
      unreadable.push({ row: row.row, id: row.id, reason });
      continue;
    }
    ids.add(row.id);
    read.push({
      view: view as View,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      position: Number(row.position),
    });
  }
  if (rows.length === 0)
    return { status: "starter", views: starter, unreadable };
  if (read.length === 0)
    return {
      status: "unsaved",
      views: starter,
      unreadable,
      reason:
        "None of this page's saved views could be read, so these are the starter views. Settings lists the rows, and can restore the starter views.",
    };
  return {
    status: "saved",
    views: inOrder(read),
    unreadable,
  };
}

/** rows of the Views tab for no page HareWare has */
export function strayRows(payload: SheetPayload | undefined): Unreadable[] {
  const sheet = payload?.sheet;
  if (sheet?.status !== "read") return [];
  return sheet.views
    .filter(
      (row) => !["articles", "people"].includes(row.page.trim().toLowerCase()),
    )
    .map((row) => ({
      row: row.row,
      id: row.id,
      reason: `its page “${row.page}” must be articles or people`,
    }));
}

/** the page's views, once the Sheet has been read; undefined until then */
export function usePageViews(source: Page): PageViews | undefined {
  const { data, isError } = useQuery({
    queryKey: SHEET_KEY,
    queryFn: readSheetPayload,
    staleTime: 60_000,
  });
  if (!data && !isError) return undefined;
  return pageViews(data, source);
}

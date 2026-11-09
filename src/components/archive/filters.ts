/* The filter bar's state, kept in the url so a view can be linked to. */

import { isRole, type Role } from "~/lib/credits/labels";
import {
  easternDate,
  periodBounds,
  periodOf,
  type Filters,
  type Period,
} from "~/lib/credits/stats";

export type Preset =
  | "all"
  | "semester"
  | "last-semester"
  | "3m"
  | "6m"
  | "12m"
  | "2y"
  | "year"
  | "custom";

/* the calendar's own periods, then the rolling ranges; `short` is what a
   narrow toolbar shows */
export const PRESETS: { id: Preset; label: string; short?: string }[] = [
  { id: "all", label: "All time" },
  { id: "semester", label: "This semester" },
  { id: "last-semester", label: "Last semester" },
  { id: "year", label: "This year" },
  { id: "3m", label: "Last 3 months", short: "3 months" },
  { id: "6m", label: "Last 6 months", short: "6 months" },
  { id: "12m", label: "Last 12 months", short: "12 months" },
  { id: "2y", label: "Last 2 years", short: "2 years" },
  { id: "custom", label: "Custom range", short: "Custom" },
];

const ROLLING: Preset[] = ["3m", "6m", "12m", "2y"];

/** a range counted back from today ("Last 3 months"), as against a calendar one */
export const isRolling = (preset: Preset) => ROLLING.includes(preset);

export type FilterState = {
  preset: Preset;
  /** used only by the custom preset */
  from?: string;
  to?: string;
  sections: string[];
  roles: Role[];
  /** exact names, whose own contributions alone count */
  people: string[];
  search: string;
};

/** nothing narrowed but the page's own time range */
export const clearedState = (preset: Preset): FilterState => ({
  preset,
  sections: [],
  roles: [],
  people: [],
  search: "",
});

/**
 * The filters once another view is chosen: each as the new view opens on it,
 * unless it has been changed since the last view opened, when the change
 * stands until Clear.
 */
export function carryOver(
  now: FilterState,
  from: FilterState,
  to: FilterState,
): FilterState {
  const kept = <T>(key: "preset" | "sections" | "roles" | "people"): T =>
    (JSON.stringify(now[key]) === JSON.stringify(from[key])
      ? to[key]
      : now[key]) as T;
  return {
    ...now,
    preset: kept("preset"),
    sections: kept("sections"),
    roles: kept("roles"),
    people: kept("people"),
  };
}

const SEMESTER_STARTS = ["01-01", "06-01"];
const SEMESTER_ENDS = ["05-31", "12-31"];

function semesterBounds(date: string, back: number) {
  let [year, order] = periodOf(date, "semester").key.split("-").map(Number) as [
    number,
    number,
  ];
  for (let i = 0; i < back; i++) {
    order--;
    if (order === 0) {
      order = 2;
      year--;
    }
  }
  return {
    from: `${year}-${SEMESTER_STARTS[order - 1]}`,
    to: `${year}-${SEMESTER_ENDS[order - 1]}`,
  };
}

/**
 * the first of the month, `months` months back counting this one, so a month
 * chart starts on a whole month rather than a sliver of one
 */
function monthsBack(today: string, months: number) {
  const [year, month] = today.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - months, 1)).toISOString().slice(0, 10);
}

/**
 * Where a rolling range starts on a chart cut into semesters or school
 * years: the first day of the period it begins in, so the first column is
 * whole rather than a sliver. Null when nothing is rounded.
 */
export function roundedStart(
  state: FilterState,
  period: Period | undefined,
  now = new Date(),
): { from: string; label: string } | null {
  if (period !== "semester" && period !== "school-year") return null;
  if (!ROLLING.includes(state.preset)) return null;
  const { from } = exactRange(state, now);
  if (!from) return null;
  const { key, label } = periodOf(from, period);
  const start = periodBounds(key, period).from;
  return start === from ? null : { from: start, label };
}

/** the one period a range is exactly ("Fall 2025"), if it is one */
export function periodNamed(from?: string, to?: string): string | null {
  if (!from || !to) return null;
  for (const period of ["semester", "school-year", "year", "month"] as const) {
    const { key, label } = periodOf(from, period);
    const bounds = periodBounds(key, period);
    if (bounds.from === from && bounds.to === to) return label;
  }
  return null;
}

/**
 * The filters as a chart cut into `period` counts them, for a link to take to
 * a page that would round them otherwise, or not at all: a rolling range that
 * starts mid-semester is the custom range from where the semester does.
 */
export function asCounted(
  state: FilterState,
  period: Period | undefined,
  now = new Date(),
): FilterState {
  const rounded = roundedStart(state, period, now);
  return rounded
    ? { ...state, preset: "custom", from: rounded.from, to: undefined }
    : state;
}

/** the dates a preset means today, with a chart's period rounding it */
export function rangeOf(
  state: FilterState,
  now = new Date(),
  period?: Period,
): { from?: string; to?: string } {
  const rounded = roundedStart(state, period, now);
  return rounded ? { from: rounded.from } : exactRange(state, now);
}

function exactRange(
  state: FilterState,
  now: Date,
): { from?: string; to?: string } {
  const today = easternDate(now.toISOString());
  switch (state.preset) {
    case "all":
      return {};
    case "semester":
      return semesterBounds(today, 0);
    case "last-semester":
      return semesterBounds(today, 1);
    case "3m":
      return { from: monthsBack(today, 3) };
    case "6m":
      return { from: monthsBack(today, 6) };
    case "12m":
      return { from: monthsBack(today, 12) };
    case "2y":
      return { from: monthsBack(today, 24) };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01` };
    case "custom":
      return { from: state.from || undefined, to: state.to || undefined };
  }
}

export function toFilters(state: FilterState, period?: Period): Filters {
  return {
    ...rangeOf(state, new Date(), period),
    sections: state.sections,
    roles: state.roles,
    people: state.people,
    search: state.search,
  };
}

const list = (value: string | null) =>
  value ? value.split(",").filter(Boolean) : [];

/* what a page opens on: a range alone, or every filter a view declares */
const openingFrom = (opening: Preset | FilterState): FilterState =>
  typeof opening === "string" ? clearedState(opening) : opening;

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The filters a link names, each it leaves out as the page opens on it.
 * Present and empty (`sections=`) is cleared, where the page opens on some.
 */
export function readState(
  search: string,
  opening: Preset | FilterState,
): FilterState {
  const own = openingFrom(opening);
  const params = new URLSearchParams(search);
  const preset = params.get("range") as Preset | null;
  return {
    preset:
      preset && PRESETS.some((p) => p.id === preset) ? preset : own.preset,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    sections: params.has("sections")
      ? list(params.get("sections"))
      : [...own.sections],
    roles: params.has("roles")
      ? list(params.get("roles")).filter(isRole)
      : [...own.roles],
    /* repeated rather than joined: a name can hold a comma */
    people: params.has("people")
      ? params.getAll("people").filter(Boolean)
      : [...own.people],
    search: params.get("q") ?? "",
  };
}

/**
 * What the search box looks at: on a page of articles, what they print; on
 * People's table, a person's name and the bylines they are credited as. Who
 * someone really is goes in the people filter, so a name searched for never
 * counts the others on that person's articles as theirs.
 */
export type Searching = "articles" | "people";

/** writes the filters into `params`, leaving a view's own parameters alone,
    and each filter out that is as the page opens on it. A null `opening`
    names the range whatever it is, as a link to another page must */
export function writeState(
  state: FilterState,
  params: URLSearchParams,
  opening: Preset | FilterState | null,
) {
  const own = opening === null ? null : openingFrom(opening);
  const set = (key: string, value: string | undefined) =>
    value ? params.set(key, value) : params.delete(key);
  /* left out as the page opens on it; else named, empty if cleared */
  const listed = (key: "sections" | "roles", value: readonly string[]) => {
    if (sameList(value, own?.[key] ?? [])) params.delete(key);
    else params.set(key, value.join(","));
  };

  set("range", own && state.preset === own.preset ? undefined : state.preset);
  set("from", state.preset === "custom" ? state.from : undefined);
  set("to", state.preset === "custom" ? state.to : undefined);
  listed("sections", state.sections);
  listed("roles", state.roles);
  params.delete("people");
  if (!sameList(state.people, own?.people ?? []))
    if (state.people.length === 0) params.set("people", "");
    else for (const name of state.people) params.append("people", name);
  set("q", state.search);
}

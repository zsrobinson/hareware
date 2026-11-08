/* The filter bar's state, kept in the url so a view can be linked to. */

import { isRole, type Role } from "~/lib/credits/labels";
import { easternDate, periodOf, type Filters } from "~/lib/credits/stats";

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

export const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "semester", label: "This semester" },
  { id: "last-semester", label: "Last semester" },
  { id: "3m", label: "Last 3 months" },
  { id: "6m", label: "Last 6 months" },
  { id: "12m", label: "Last 12 months" },
  { id: "2y", label: "Last 2 years" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom range" },
];

export type FilterState = {
  preset: Preset;
  /** used only by the custom preset */
  from?: string;
  to?: string;
  sections: string[];
  roles: Role[];
  search: string;
};

/** nothing narrowed but the page's own time range */
export const clearedState = (preset: Preset): FilterState => ({
  preset,
  sections: [],
  roles: [],
  search: "",
});

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

/** the dates a preset means today */
export function rangeOf(
  state: FilterState,
  now = new Date(),
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

export function toFilters(state: FilterState): Filters {
  return {
    ...rangeOf(state),
    sections: state.sections,
    roles: state.roles,
    search: state.search,
  };
}

const list = (value: string | null) =>
  value ? value.split(",").filter(Boolean) : [];

/** `fallback` is the page's own range, which its links leave out */
export function readState(search: string, fallback: Preset): FilterState {
  const params = new URLSearchParams(search);
  const preset = params.get("range") as Preset | null;
  return {
    preset: preset && PRESETS.some((p) => p.id === preset) ? preset : fallback,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    sections: list(params.get("sections")),
    roles: list(params.get("roles")).filter(isRole),
    search: params.get("q") ?? "",
  };
}

/** writes the filters into `params`, leaving a view's own parameters alone */
export function writeState(
  state: FilterState,
  params: URLSearchParams,
  fallback: Preset,
) {
  const set = (key: string, value: string | undefined) =>
    value ? params.set(key, value) : params.delete(key);

  set("range", state.preset === fallback ? undefined : state.preset);
  set("from", state.preset === "custom" ? state.from : undefined);
  set("to", state.preset === "custom" ? state.to : undefined);
  set("sections", state.sections.join(","));
  set("roles", state.roles.join(","));
  set("q", state.search);
}

import { afterEach, expect, test, vi } from "vitest";
import { describeFilters } from "./archive-shell";
import { clearedState, rangeOf, type Preset } from "./filters";

/* 8 November 2026, Eastern */
const now = new Date("2026-11-08T17:00:00Z");
const state = (preset: Preset) => clearedState(preset);

afterEach(() => {
  vi.useRealTimers();
});

test("a rolling range on a semester chart starts where its first semester does", () => {
  /* two years back, counting this month, is December 2024: late in Fall 2024 */
  expect(rangeOf(state("2y"), now)).toEqual({ from: "2024-12-01" });
  expect(rangeOf(state("2y"), now, "semester")).toEqual({ from: "2024-06-01" });
  /* and a school year's, from its June */
  expect(rangeOf(state("3m"), now, "school-year")).toEqual({
    from: "2026-06-01",
  });
  /* a month chart's months are whole already, and a calendar range is left
     as it was chosen */
  expect(rangeOf(state("2y"), now, "month")).toEqual({ from: "2024-12-01" });
  expect(rangeOf(state("year"), now, "semester")).toEqual({
    from: "2026-01-01",
  });
});

test("a caption says where a rounded range starts", () => {
  vi.useFakeTimers({ now });
  expect(describeFilters(state("2y"), "semester")).toBe(
    "Last 2 years, from Fall 2024",
  );
  expect(describeFilters(state("2y"))).toBe("Last 2 years");
});

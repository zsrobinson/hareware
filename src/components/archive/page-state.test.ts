import { expect, test } from "vitest";
import { readChoice, readSort, writeChoice, writeSort } from "./page-state";

const COLUMNS = ["name", "contributions", "first"];

test("a link keeps a table's sort, either way, beside the filters", () => {
  for (const sorting of [
    [{ id: "first", desc: false }],
    [{ id: "contributions", desc: true }],
  ]) {
    const params = new URLSearchParams("range=all&q=ada");
    writeSort(sorting, params);
    expect(readSort(`?${params}`, COLUMNS)).toEqual(sorting);
    expect(params.get("q")).toBe("ada");
  }
  expect(readSort("?sort=-contributions", COLUMNS)).toEqual([
    { id: "contributions", desc: true },
  ]);

  const unsorted = new URLSearchParams("sort=first");
  writeSort([], unsorted);
  expect(unsorted.has("sort")).toBe(false);
});

test("a sort on a column the table does not have is left unsorted", () => {
  expect(readSort("?sort=-views", COLUMNS)).toEqual([]);
  expect(readSort("?sort=", COLUMNS)).toEqual([]);
});

test("a page's own choice is in its link unless it is the default", () => {
  const options = ["1", "2", "5"];
  const params = new URLSearchParams();
  writeChoice("5", params, "min", "1");
  expect(params.get("min")).toBe("5");
  expect(readChoice(`?${params}`, "min", options, "1")).toBe("5");

  writeChoice("1", params, "min", "1");
  expect(params.has("min")).toBe(false);
  /* a minimum no longer offered opens on the default */
  expect(readChoice("?min=4", "min", options, "1")).toBe("1");
});

/*
  What an archive page keeps in the address besides its filters, so a
  reload or a link opens it as it was: a table's sort (`sort=first`, or
  `sort=-first` for the other way), and a page's own choices, as People's
  minimum. Each is left out while it is the page's default.
*/

import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** the sort a link names, on one of `columns`; unsorted otherwise */
export function readSort(
  search: string,
  columns: readonly string[],
): SortingState {
  const value = new URLSearchParams(search).get("sort") ?? "";
  const desc = value.startsWith("-");
  const id = desc ? value.slice(1) : value;
  return columns.includes(id) ? [{ id, desc }] : [];
}

/* a header click sorts by one column, so only the first is kept */
export function writeSort(sorting: SortingState, params: URLSearchParams) {
  const [by] = sorting;
  if (by) params.set("sort", `${by.desc ? "-" : ""}${by.id}`);
  else params.delete("sort");
}

/** one of `options` under `key`, else the page's own */
export function readChoice<T extends string>(
  search: string,
  key: string,
  options: readonly T[],
  fallback: T,
): T {
  const value = new URLSearchParams(search).get(key);
  return options.includes(value as T) ? (value as T) : fallback;
}

export function writeChoice(
  value: string,
  params: URLSearchParams,
  key: string,
  fallback: string,
) {
  if (value === fallback) params.delete(key);
  else params.set(key, value);
}

/** state read from the address as the page opens, and written back to it */
function useInAddress<T>(
  read: (search: string) => T,
  write: (value: T, params: URLSearchParams) => void,
) {
  /* the archive's pages draw once hydrated, so the address is there */
  const [value, setValue] = useState(() => read(window.location.search));
  const latest = useRef(write);
  useLayoutEffect(() => {
    latest.current = write;
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    latest.current(value, url.searchParams);
    window.history.replaceState(window.history.state, "", url);
  }, [value]);
  return [value, setValue] as const;
}

const idOf = <T>(column: ColumnDef<T, unknown>) =>
  column.id ?? ("accessorKey" in column ? String(column.accessorKey) : "");

/**
 * A table's sort, kept in the address. A sort on a column the table does
 * not have now (Other, until the Roles filter asks for it) is held, and
 * comes back with the column.
 */
export function useSort<T>(
  columns: readonly ColumnDef<T, unknown>[],
  /** the columns the table has only sometimes, which a link may sort by */
  sometimes: readonly string[] = [],
) {
  const ids = columns.map(idOf);
  const [sorting, setSorting] = useInAddress(
    (search) => readSort(search, [...ids, ...sometimes]),
    writeSort,
  );
  return [sorting.filter((by) => ids.includes(by.id)), setSorting] as const;
}

/** a choice of the page's own, under `key` in the address */
export function useChoice<T extends string>(
  key: string,
  options: readonly T[],
  fallback: T,
) {
  return useInAddress(
    (search) => readChoice(search, key, options, fallback),
    (value, params) => writeChoice(value, params, key, fallback),
  );
}

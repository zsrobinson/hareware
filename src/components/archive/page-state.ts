/* A page's own state in the address beside the filters, left out at its
   default: `sort=first`, `sort=-first` the other way, and `min` on People. */

import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

/* a sort on a column the table does not have now (Other, until the Roles
   filter asks for it) is held, and comes back with the column */
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

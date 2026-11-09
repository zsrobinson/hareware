/* A page's own state in the address beside the filters, left out at its
   default: `sort=first`, `sort=-first` the other way (./view-state keeps
   it), and `min` on People. */

import type { SortingState } from "@tanstack/react-table";
import { useEffect, useState } from "react";

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

/* `write` may read more than `value` (a page's default range), so it runs
   after every render, and the address is replaced only when it changes */
export function useInAddress<T>(
  read: (search: string) => T,
  write: (value: T, params: URLSearchParams) => void,
) {
  /* the built page has no address; nothing is drawn from it until hydrated */
  const [value, setValue] = useState(() =>
    read(typeof window === "undefined" ? "" : window.location.search),
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    write(value, url.searchParams);
    if (url.href !== window.location.href)
      window.history.replaceState(window.history.state, "", url);
  });
  return [value, setValue] as const;
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

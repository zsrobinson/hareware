/*
  the view a table is currently showing — what is searched, filtered, sorted,
  and which row is open — kept in the query string.

  a debugging session ends with somebody pasting a link into discord, and a
  link that reopens the same twelve rows is worth more than one that reopens
  the whole log and a description of how to find them again. reloading after a
  cron fires keeps the view too, which is the other half of the same property
*/

import { useCallback, useSyncExternalStore } from "react";

/** everything watching the query string, so a write reaches all of it */
const watchers = new Set<() => void>();

const changed = () => {
  for (const watcher of watchers) watcher();
};

/** the query string as it stands, and empty rather than absent on the server */
export function params(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

/**
 * merges keys into the query string, dropping the ones set to null.
 *
 * merged rather than replaced so two components can each own their own
 * parameters without either clobbering the other, and `replaceState` so that
 * ticking a filter does not put a stop on the back button
 */
export function setParams(patch: Record<string, string | null>) {
  if (typeof window === "undefined") return;

  const next = params();
  for (const [key, value] of Object.entries(patch)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }

  const query = next.toString();
  const { pathname, hash } = window.location;
  window.history.replaceState(
    null,
    "",
    `${pathname}${query ? `?${query}` : ""}${hash}`,
  );

  changed();
}

const subscribe = (watcher: () => void) => {
  watchers.add(watcher);
  window.addEventListener("popstate", watcher);
  return () => {
    watchers.delete(watcher);
    window.removeEventListener("popstate", watcher);
  };
};

/**
 * one query parameter, read and written as if it were state.
 *
 * the url is the state rather than a copy of it, which is what makes the back
 * button and a pasted link behave the same as clicking. `useSyncExternalStore`
 * because that is what the query string is — an outside system, with a
 * different answer on the server, where it has none
 */
export function useParam(
  key: string,
  fallback: string,
): [string, (value: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    useCallback(() => params().get(key) ?? fallback, [key, fallback]),
    useCallback(() => fallback, [fallback]),
  );

  const set = useCallback(
    (next: string | null) => setParams({ [key]: next }),
    [key],
  );

  return [value, set];
}

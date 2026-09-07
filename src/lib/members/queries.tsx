/*
  the islands' side of the GET routes above.

  three things live here, and each is here because an island getting it wrong
  is invisible:

  - `RosterQueries`, the provider. These are separate astro islands hydrated
    independently, so there is no single React root to put one at the top of
    and no shared cache between them. Each island wraps itself.
  - the query keys, spelled once. A mutation that invalidates a key nobody
    reads is a mutation that silently still needs a reload, and two string
    literals in two files is exactly how that happens.
  - `useRosterQuery`, which takes the page's server-rendered read as
    `initialData`. That is what keeps first paint the same: the island renders
    the data the page already had, rather than a spinner and a second request
    for what is on screen.
*/

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { notify } from "~/lib/notify";

/** every roster query's key, so a mutation cannot invalidate a name nobody uses */
export const rosterKeys = {
  /* the pinned meeting is part of the key, because it is part of the answer:
     the route decides which meetings are offerable around it. A constant key
     with the meeting in the path only meant a refetch after a switch re-read
     the meeting the page opened on */
  kiosk: (meetingId = "") =>
    ["members", "kiosk", meetingId] as const satisfies QueryKey,
  reconciler: () => ["members", "reconciler"] as const satisfies QueryKey,
};

/**
 * how long a read stays fresh before a refocus would re-ask for it.
 *
 * notion allows about three requests a second and each of these reads is
 * several, so a window regaining focus may not cost a page load's worth of
 * them. The invalidations after a mutation are exact and ignore this
 */
const FRESH_MS = 60_000;

function client() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: FRESH_MS,
        /* the kiosk is a laptop somebody walks past all evening, and the
           reconciler is worked through top to bottom. A list reordering itself
           because a window was clicked loses the reader's place */
        refetchOnWindowFocus: false,
        /* and not because the wifi blinked. this defaults to true, and on a
           meeting room's network every `online` event would spend a read worth
           several notion requests, which `retry: false` then turns into a
           visible error rather than a retry */
        refetchOnReconnect: false,
        /* a read here is several notion requests; retrying a failed one three
           times is how a rate limit becomes a worse rate limit. The client
           already waits out a 429 on each request */
        retry: false,
      },
    },
  });
}

/**
 * the cache, at module scope so it outlives a remount.
 *
 * it was per-mount, which reads as the tidier choice and was wrong here:
 * `dashboard.astro` renders `<ClientRouter />`, so every navigation swaps the
 * body and remounts the islands, and a client in `useState` was thrown away
 * with them. Every visit then paid for a full read again, which is the
 * "constantly reloading" this layer was added to stop.
 *
 * outliving the tree is the point, not a leak: the entries are the roster, the
 * keys are stable, and `staleTime` decides when they are asked for again
 */
let cache: QueryClient | undefined;

function sharedClient() {
  return (cache ??= client());
}

export function RosterQueries({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={sharedClient()}>
      {children}
    </QueryClientProvider>
  );
}

/**
 * a roster read, seeded with what the page already rendered.
 *
 * `initialData` is the whole point of the shape: the astro page reads
 * server-side and hands the answer down, so this resolves on the first render
 * with no loading state and no second fetch on arrival. `path` answers the
 * same type from the same function in `~/lib/members/views`
 */
export function useRosterQuery<T extends object>(
  key: QueryKey,
  path: string,
  initialData: T,
): T {
  const { data, isError, error } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<T> => {
      const response = await fetch(path, {
        headers: { accept: "application/json" },
      });

      const said = (await response.json().catch(() => ({}))) as T & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          said.error ?? `${response.status} ${response.statusText}`,
        );
      }

      return said;
    },
    initialData,
  });

  /*
    a failed refetch leaves the last good answer on screen, which is the right
    thing to show and the wrong thing to show *silently*: on the reconciler,
    the page somebody opens the morning of an election, a stale screen and a
    fresh one look identical. so it says so once per failure
  */
  useEffect(() => {
    if (isError) {
      notify.failed(
        `Could not refresh: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, [isError, error]);

  return data;
}

/**
 * edits the cached answer in place, without a read.
 *
 * for the one case a refetch cannot cover: a row the person at the laptop just
 * created or corrected has to be on screen before notion has been asked again.
 * Paired with `useRefresh` rather than used instead of it, so the optimistic
 * shape is replaced by notion's own within the same interaction
 */
export function usePatch<T>(key: QueryKey) {
  const queries = useQueryClient();

  return (change: (current: T) => T) =>
    queries.setQueryData<T>(key, (current) =>
      current === undefined ? current : change(current),
    );
}

/**
 * re-reads one roster query after a write.
 *
 * returned as a function rather than called for you, because the kiosk's
 * attendance write deliberately does not use it: that one is optimistic with a
 * rollback, and turning it into a refetch would put a round trip between a
 * person tapping their name and the room seeing it
 */
export function useRefresh(key: QueryKey) {
  const queries = useQueryClient();

  return () => queries.invalidateQueries({ queryKey: key });
}

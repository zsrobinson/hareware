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

/**
 * the errors already toasted about.
 *
 * module scope for the same reason the client is: both outlive the mounted
 * tree, so a ref would forget on every navigation and say it again. Weak so a
 * collected error takes its entry with it
 */
const reported = new WeakSet<object>();

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
  /**
   * whether `initialData` actually describes *this* key.
   *
   * react query installs `initialData` under whatever key has no entry yet, so
   * a key that varies — the kiosk's, which carries the pinned meeting — would
   * otherwise be seeded with the page's opening snapshot and, with no
   * `initialDataUpdatedAt`, treated as fresh for a whole `staleTime`. Switching
   * meetings then showed the previous meeting's answer for a minute, which is
   * the bug varying the key was meant to fix.
   *
   * false stamps the seed as already stale, so it still paints without a
   * loading flash and re-reads immediately
   */
  seeded = true,
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
    ...(seeded ? {} : { initialDataUpdatedAt: 0 }),
  });

  /*
    a failed refetch leaves the last good answer on screen, which is the right
    thing to show and the wrong thing to show *silently*: on the reconciler,
    the page somebody opens the morning of an election, a stale screen and a
    fresh one look identical. so it says so once per failure.

    once per *failure*, not once per mount. the client outlives the tree now,
    so a failed query keeps its error in the cache and every navigation back to
    the page would otherwise toast again about a failure from minutes ago
  */
  useEffect(() => {
    if (!isError || !error || reported.has(error)) return;

    reported.add(error);
    notify.failed(
      `Could not refresh: ${error instanceof Error ? error.message : String(error)}`,
    );
  }, [isError, error]);

  return data;
}

/**
 * edits the cached answer in place, without a read.
 *
 * for the one case a read cannot cover in time: a row the person at the laptop
 * just created or corrected has to be on screen before notion is asked again.
 * The kiosk uses this alone, deliberately. Pairing it with `useRefresh` there
 * spent three notion requests to be told what the page had just written, and
 * redrew a screen somebody is queueing at while it did
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

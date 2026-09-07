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
import { useState, type ReactNode } from "react";

/** every roster query's key, so a mutation cannot invalidate a name nobody uses */
export const rosterKeys = {
  kiosk: () => ["members", "kiosk"] as const satisfies QueryKey,
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
        /* a read here is several notion requests; retrying a failed one three
           times is how a rate limit becomes a worse rate limit. The client
           already waits out a 429 on each request */
        retry: false,
      },
    },
  });
}

/**
 * one cache per island.
 *
 * created in state rather than at module scope so it belongs to the mounted
 * tree: a module-level client is shared by every island in the bundle and
 * outlives the component that filled it
 */
export function RosterQueries({ children }: { children: ReactNode }) {
  const [queries] = useState(client);

  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
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
  const { data } = useQuery({
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

  return data;
}

/**
 * re-reads one roster query after a write.
 *
 * returned as a function rather than called for you, because the kiosk's
 * attendance write deliberately does not use it: that one is optimistic with a
 * rollback, and turning it into a refetch would put a round trip between a
 * person tapping their name and the room seeing it
 */
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

export function useRefresh(key: QueryKey) {
  const queries = useQueryClient();

  return () => queries.invalidateQueries({ queryKey: key });
}

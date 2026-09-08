/*
  the provider, and the cache it hands down.

  alone in this file on purpose. react fast refresh only accepts a module whose
  every export is a component, and `queries.ts` next door exports hooks — with
  the two together, every edit to either invalidated the module and took the
  island down with it. In a dev session that is the room's sign-ins vanishing
  under whoever is typing, which is a debugging story nobody should have to
  work out twice.
*/

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

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

/**
 * one provider per island.
 *
 * these are separate astro islands hydrated independently, so there is no
 * single react root to put one at the top of. Each island wraps itself, and
 * they share the cache below
 */
export function RosterQueries({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={sharedClient()}>
      {children}
    </QueryClientProvider>
  );
}

/* its own module for react fast refresh; see `queries.ts` */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/* each read is several notion requests against a limit of about three a
   second. Invalidations after a write ignore this */
const FRESH_MS = 60_000;

function client() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: FRESH_MS,
        /* a list reordering because a window was clicked loses the reader's
           place */
        refetchOnWindowFocus: false,
        /* a meeting room's wifi would spend a read on every `online` event */
        refetchOnReconnect: false,
        /* retrying turns a rate limit into a worse one; the notion client
           already waits out each 429 */
        retry: false,
      },
    },
  });
}

/* module scope because `<ClientRouter />` remounts every island on
   navigation, and a per-mount client would re-read everything each visit */
let cache: QueryClient | undefined;

function sharedClient() {
  return (cache ??= client());
}

/** one provider per island, since astro hydrates each separately; they share the cache */
export function RosterQueries({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={sharedClient()}>
      {children}
    </QueryClientProvider>
  );
}

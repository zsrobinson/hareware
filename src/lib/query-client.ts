/*
  One QueryClient for every island. Astro's client router keeps this window
  between pages, so what one page read is already there when the next opens:
  back from the slides to the list, or from Charts to People, nothing is read
  twice. Signing out reloads the page, which empties it.
*/

import { QueryClient } from "@tanstack/react-query";
import { Refused } from "~/components/gated";
import { Throttled } from "~/lib/services/wordpress/request";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,
      refetchOnWindowFocus: false,
      /* a refusal is an answer, and WordPress's refusals are already waited
         out by readWordPress: retrying either only makes the page slower */
      retry: (count, error) =>
        !(error instanceof Refused) &&
        !(error instanceof Throttled) &&
        count < 1,
    },
  },
});

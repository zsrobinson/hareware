/*
  The routes src/worker.ts answers before Astro sees the request: each only
  forwards a GET, which the pipeline is not needed for, and every request is
  held to 10 ms of CPU (ADR 0012). Anything else, another method included,
  is Astro's.
*/

import { passThrough } from "./services/wordpress/pass-through";
import { STATS_THROUGH } from "./services/wordpress/stats";
import { PASS_THROUGH } from "./services/wordpress/urls";
import { answerStats } from "./stats-api";

/** the answer to `request` if it is one of these, or null for Astro's */
export function aheadOfAstro(request: Request): Promise<Response> | null {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  /* WordPress's cached answers for the browser */
  if (url.pathname.startsWith(PASS_THROUGH)) return passThrough(url);
  /* Jetpack's view counts, behind the gate */
  if (url.pathname.startsWith(STATS_THROUGH)) return answerStats(request);
  return null;
}

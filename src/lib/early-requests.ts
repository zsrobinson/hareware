/*
  Requests a page sent before its JavaScript arrived, by address. The inline
  script ~/lib/early builds puts them here; the first read of the same address
  takes one rather than sending its own.
*/

declare global {
  var __early:
    Map<string, { at: number; response: Promise<Response> }> | undefined;
}

/**
 * how long a request sent early is worth taking. Astro's router runs a page's
 * inline script only once per window, so a request the island never took (it
 * already had the answer in memory) would otherwise wait to be served as new
 * long after it was made
 */
export const EARLY_FOR_MS = 10_000;

/**
 * the request already sent for `url`, if the page started one recently; each
 * is taken once, so a retry or a refresh asks afresh
 */
export function takeEarly(url: string): Promise<Response> | undefined {
  const early = globalThis.__early?.get(url);
  globalThis.__early?.delete(url);
  return early && Date.now() - early.at < EARLY_FOR_MS
    ? early.response
    : undefined;
}

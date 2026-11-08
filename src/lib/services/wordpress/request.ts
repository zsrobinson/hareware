/*
  One read from WordPress's REST API, patiently. In a browser it goes through
  HareWare's /api/wordpress first, which WordPress answers from its cache;
  if that fails, or anywhere else, it goes to WordPress directly.

  WordPress.com throttles with 429 and sometimes a 5xx. Its 429 carries no
  CORS headers and no Retry-After (checked 2026-11-07), so in a browser a
  throttled answer is only a failed fetch, and that counts as the same thing.
  Each is retried briefly, and then the caller gets a `Throttled` to explain
  in words rather than a page that just stops.
*/

import { takeEarly } from "~/lib/early";
import { viaHareWare } from "./urls";
import { errorMessage } from "~/lib/utils";

/** WordPress turned the request away for now; waiting a minute is the fix */
export class Throttled extends Error {}

/** retries after a refusal, and after a fetch that failed outright */
const REFUSED_RETRIES = 2;
const FAILED_RETRIES = 2;

/** the longest one wait: retry-after is a request, and a silent page reads as broken */
const MAX_WAIT_MS = 4000;

const sleep = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

/**
 * the least time between two reads sent to WordPress directly. With an
 * `Origin` header WordPress.com skips its cache, and its server refused about
 * every other request sent back to back; half a second between them drew none
 * (checked 2026-11-07). Reads through /api/wordpress come from the cache and
 * need no gap
 */
const BETWEEN_DIRECT_MS = 500;
let lastDirect = 0;
async function spaced(url: string): Promise<Response> {
  /* never more than the gap itself, whatever the clock did in between */
  const wait = Math.min(
    lastDirect + BETWEEN_DIRECT_MS - Date.now(),
    BETWEEN_DIRECT_MS,
  );
  if (wait > 0) await sleep(wait);
  lastDirect = Date.now();
  return fetch(url);
}

/** `Retry-After` in seconds, as milliseconds; the date form is ignored */
function told(header: string | null): number | undefined {
  const seconds = Number(header?.trim());
  return header && Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : undefined;
}

export type Fresh = {
  /**
   * past every cache, for a read someone asked for, such as Refresh after a
   * fix in WordPress: WordPress answers a request with an Origin from its
   * server, so in a browser this goes to it directly
   */
  fresh?: boolean;
};

/**
 * the response to `url`, whatever its status other than a refusal; throws
 * `Throttled` once WordPress has refused, or not answered, a few times running.
 * `describe` goes into the error
 */
export async function readWordPress(
  url: string,
  describe: string,
  { fresh = false }: Fresh = {},
): Promise<Response> {
  /* in a browser, through HareWare first: WordPress's cache answers it. A
     refusal or a failure there falls through to asking WordPress itself */
  if (typeof document !== "undefined" && !fresh) {
    const through = viaHareWare(url);
    try {
      /* the page may have sent it already: ~/lib/early */
      const response = await (takeEarly(through) ?? fetch(through));
      if (response.status !== 429 && response.status < 500) return response;
    } catch (thrown) {
      console.warn(`[wordpress] ${describe} through HareWare`, thrown);
    }
  }

  let failed = 0;
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      /* the page may have sent the first one already: ~/lib/early */
      response = await ((attempt === 0 && failed === 0 && takeEarly(url)) ||
        spaced(url));
    } catch (thrown) {
      if (failed >= FAILED_RETRIES)
        throw new Throttled(`${describe}: ${errorMessage(thrown)}`);
      /* about 1.2 s, then 2.5 s: a throttle here lifts within a few seconds */
      await sleep(1200 * 2 ** failed++ + Math.random() * 400);
      continue;
    }

    if (response.status !== 429 && response.status < 500) return response;
    if (attempt >= REFUSED_RETRIES)
      throw new Throttled(`${describe} answered ${response.status}`);

    /* jittered, so several reads refused together do not retry in step */
    const wait =
      told(response.headers.get("retry-after")) ??
      500 * 2 ** attempt + Math.random() * 400;
    await sleep(Math.min(wait, MAX_WAIT_MS));
  }
}

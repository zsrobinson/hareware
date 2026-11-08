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

import { takeEarly } from "~/lib/early-requests";
import { retryAfterMs } from "~/lib/rate-limit";
import { errorMessage } from "~/lib/utils";
import { viaHareWare } from "./urls";

/** WordPress turned the request away for now; waiting a minute is the fix */
export class Throttled extends Error {}

/** tries sent to WordPress directly, the first included */
const ATTEMPTS = 3;

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
let nextDirect = 0;
async function spaced(url: string): Promise<Response> {
  const now = Date.now();
  /* a clock that went backwards must not leave reads waiting on it */
  if (nextDirect - now > 10 * BETWEEN_DIRECT_MS) nextDirect = now;
  /* the slot is taken before waiting, so reads that start together queue a
     gap apart rather than all waking at once */
  const at = Math.max(now, nextDirect);
  nextDirect = at + BETWEEN_DIRECT_MS;
  if (at > now) await sleep(at - now);
  return fetch(url);
}

export type ReadOptions = {
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
  { fresh = false }: ReadOptions = {},
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

  for (let attempt = 1; ; attempt++) {
    let response: Response | undefined;
    let failure: unknown;
    try {
      response = await spaced(url);
    } catch (thrown) {
      failure = thrown;
    }
    if (response && response.status !== 429 && response.status < 500)
      return response;
    if (attempt >= ATTEMPTS)
      throw new Throttled(
        response
          ? `${describe} answered ${response.status}`
          : `${describe}: ${errorMessage(failure)}`,
      );

    /* a refusal waits what it was told, or half a second doubling; a failed
       fetch, a refusal that lost its headers, about 1.2 s then 2.5 s, as a
       throttle there lifts within a few seconds. Jittered, so reads refused
       together do not retry in step */
    const wait = response
      ? (retryAfterMs(response.headers.get("retry-after")) ??
        500 * 2 ** (attempt - 1))
      : 1200 * 2 ** (attempt - 1);
    await sleep(Math.min(wait + Math.random() * 400, MAX_WAIT_MS));
  }
}

/**
 * the JSON in WordPress's answer, or a throw that says what went wrong. A
 * throttled WordPress.com sometimes answers 200 with an HTML page, which is a
 * refusal too, not a bad article
 */
export async function jsonOf<T>(
  response: Response,
  describe: string,
): Promise<T> {
  if (!response.ok) throw new Error(`${describe} answered ${response.status}`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new Throttled(`${describe} answered something other than JSON`);
  }
}

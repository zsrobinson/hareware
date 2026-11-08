/*
  One read from WordPress's REST API, patiently. In a browser it goes through
  HareWare's /api/wordpress, which WordPress answers from its cache (or, for a
  fresh read, from its server, still asked from Cloudflare); if that fails, and
  anywhere else, it goes to WordPress directly.

  What WordPress.com does here is undocumented, so this is what it was seen to
  do (2026-11-08). It throttles requests its cache cannot answer, per address:
  a dozen at once from one address drew 429s, the same through the Worker,
  which leaves from Cloudflare's many addresses, drew none, and cached answers
  are never refused. Its 429 is an HTML page from its edge with no Retry-After,
  no rate-limit headers and no CORS headers, so in a browser it is only a
  failed fetch, and that counts as the same thing. Each is retried briefly, on
  waits of our own choosing, and then the caller gets a `Throttled` to explain
  in words rather than a page that just stops.
*/

import { takeEarly } from "~/lib/early-requests";
import { errorMessage } from "~/lib/utils";
import { viaHareWare } from "./urls";

/** WordPress turned the request away for now; waiting a minute is the fix */
export class Throttled extends Error {}

/** tries sent to WordPress directly, the first included */
const ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

export type ReadOptions = {
  /**
   * past every cache, for a read someone asked for, such as Refresh after a
   * fix in WordPress
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
  /* in a browser, through HareWare first. A refusal or a failure there falls
     through to asking WordPress itself, which a browser's Origin header sends
     past its cache too */
  if (typeof document !== "undefined") {
    const through = viaHareWare(url, { fresh });
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
      response = await fetch(url);
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

    /* WordPress names no wait, and its refusals came interleaved with
       answers a second apart, so its allowance comes back within seconds:
       half a second then one for a refusal, longer for a failed fetch, which
       may be a refusal that lost its headers or a network that is gone.
       Jittered, so reads refused together do not retry in step */
    const wait = (response ? 500 : 1200) * 2 ** (attempt - 1);
    await sleep(wait + Math.random() * 400);
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

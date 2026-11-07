/*
  One read from WordPress's REST API, patiently. WordPress.com throttles with
  429 and sometimes a 5xx. Its 429 carries no CORS headers and no Retry-After
  (checked 2026-11-07), so in a browser a throttled answer is only a failed
  fetch, and that counts as the same thing. Each is retried briefly, and then the caller
  gets a `Throttled` to explain in words rather than a page that just stops.
*/

import { takeEarly } from "~/lib/early";
import { errorMessage } from "~/lib/utils";

/** WordPress turned the request away for now; waiting a minute is the fix */
export class Throttled extends Error {}

/** retries after a refusal, and after a fetch that failed outright */
const REFUSED_RETRIES = 2;
const FAILED_RETRIES = 2;

/** the longest one wait: retry-after is a request, and a silent page reads as broken */
const MAX_WAIT_MS = 4000;

const sleep = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

/** `Retry-After` in seconds, as milliseconds; the date form is ignored */
function told(header: string | null): number | undefined {
  const seconds = Number(header?.trim());
  return header && Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : undefined;
}

/**
 * the response to `url`, whatever its status other than a refusal; throws
 * `Throttled` once WordPress has refused, or not answered, a few times running.
 * `describe` goes into the error
 */
export async function readWordPress(
  url: string,
  describe: string,
): Promise<Response> {
  let failed = 0;
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      /* the page may have sent the first one already: ~/lib/early */
      response = await ((attempt === 0 && failed === 0 && takeEarly(url)) ||
        fetch(url));
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

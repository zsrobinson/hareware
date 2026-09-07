/*
  a request that survives being told to slow down.

  notion allows about three requests a second per integration and discord
  meters per route, and a page here fans out over both: /attendance asks notion
  five questions at once and /standing four. Neither client had any 429
  handling, so a burst that crossed the budget surfaced as a page error naming
  a status code, which is what "resource error" looked like from the room.

  a 429 is the one failure worth retrying, because the server has told us both
  that it will succeed and when. Everything else stays the caller's to report:
  a 403 retried three times is three requests spent on the same refusal.
*/

/** thrown when the budget was still exhausted after every attempt */
export class RateLimited extends Error {}

/**
 * how many times a 429 is retried before giving up.
 *
 * bounded rather than "until it works": a worker request has a wall clock and
 * an integration that is genuinely over budget stays over it, so an unbounded
 * retry turns a page error into a page that never answers
 */
const ATTEMPTS = 3;

/** the wait when the response named none, doubling per attempt */
const BACKOFF_MS = 500;

/**
 * the longest we will wait for one retry, however long we were told.
 *
 * notion has answered `Retry-After: 60` while shedding load, and a page that
 * hangs for a minute is indistinguishable from one that is broken
 */
const CAP_MS = 5_000;

const sleep = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

/**
 * `Retry-After` in milliseconds, or undefined when the header said nothing
 * usable.
 *
 * the header is defined as either seconds or an HTTP date; both are in use and
 * only the numeric form is worth reading here, since a date form needs the
 * server's clock to agree with ours to mean anything. A malformed value is
 * absence rather than `NaN` going into a timer
 */
export function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;

  const seconds = Number(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;

  return seconds * 1000;
}

/**
 * runs `send` until it answers something other than 429.
 *
 * `send` builds and issues the request rather than being handed one, because a
 * `Request` with a body cannot be sent twice. `describe` names the call in the
 * error a caller shows a person, so it may not contain a token.
 *
 * the response is returned whatever its status: deciding what a 404 or a 400
 * means belongs to the client that knows the endpoint. Only exhausting the
 * retries throws.
 */
export async function sendPatiently(
  send: () => Promise<Response>,
  describe: string,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await send();
    if (response.status !== 429) return response;

    if (attempt >= ATTEMPTS) {
      throw new RateLimited(
        `${describe} was rate limited, and still was after ${ATTEMPTS} retries`,
      );
    }

    /* the server's own number wins where it gave one: it knows when its window
       resets, and our backoff is only a guess at it */
    const told = retryAfterMs(response.headers.get("retry-after"));
    await sleep(Math.min(told ?? BACKOFF_MS * 2 ** attempt, CAP_MS));
  }
}

/*
  retrying a request that was answered 429, the one failure the server says
  will succeed and when. Every other status is the caller's to interpret.
*/

class RateLimited extends Error {}

/** retries before giving up: a worker request has a wall clock */
const ATTEMPTS = 3;

/** the wait when the response named none, doubling per attempt */
const BACKOFF_MS = 500;

/** the longest one wait, however long we were told: notion has said 60 seconds */
const CAP_MS = 5_000;

const sleep = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

/**
 * `Retry-After` in milliseconds, or undefined. Only the seconds form is read:
 * the date form needs clocks that agree, and `NaN` in a timer fires at once
 */
function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;

  const seconds = Number(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;

  return seconds * 1000;
}

/**
 * runs `send` until it answers something other than 429, and returns that
 * response whatever its status. `send` builds the request each time, since a
 * body cannot be sent twice; `describe` goes into the error and must not hold
 * a token
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

    const told = retryAfterMs(response.headers.get("retry-after"));
    await sleep(Math.min(told ?? BACKOFF_MS * 2 ** attempt, CAP_MS));
  }
}

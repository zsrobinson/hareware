import { afterEach, expect, test, vi } from "vitest";
import { readWordPress, Throttled } from "./request";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* runs a read to its end, with the waits between tries skipped */
async function settle<T>(promise: Promise<T>) {
  vi.useFakeTimers();
  const outcome = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return outcome;
}

test("a throttled answer is retried, and a later answer is returned", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(Response.json([1]));
  vi.stubGlobal("fetch", fetch);

  const result = await settle(readWordPress("https://x.test/a", "a read"));

  expect(fetch).toHaveBeenCalledTimes(2);
  expect("value" in result && result.value.status).toBe(200);
});

/* WordPress.com's 429 has no CORS headers, so a browser sees a failed fetch */
test("a fetch that fails outright counts as throttled, after a couple of tries", async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetch);

  const result = await settle(readWordPress("https://x.test/a", "a read"));

  expect(fetch).toHaveBeenCalledTimes(3);
  expect("error" in result && result.error).toBeInstanceOf(Throttled);
});

test("a refusal that persists ends as throttled, not as an empty answer", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);

  const result = await settle(readWordPress("https://x.test/a", "a read"));

  expect(fetch).toHaveBeenCalledTimes(3);
  expect("error" in result && result.error).toBeInstanceOf(Throttled);
});

test("any other status is the caller's to read", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 400 })),
  );

  const result = await settle(readWordPress("https://x.test/a", "a read"));

  expect("value" in result && result.value.status).toBe(400);
});

import { afterEach, expect, test, vi } from "vitest";
import { readWordPress, Throttled } from "./request";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* runs a read to its end, with the waits between tries skipped; the clock is
   faked before the read starts, so its first wait is a fake one too */
async function settle<T>(read: () => Promise<T>) {
  vi.useFakeTimers();
  const outcome = read().then(
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

  const result = await settle(() =>
    readWordPress("https://x.test/a", "a read"),
  );

  expect(fetch).toHaveBeenCalledTimes(2);
  expect("value" in result && result.value.status).toBe(200);
});

/* WordPress.com's 429 has no CORS headers, so a browser sees a failed fetch */
test("a fetch that fails outright counts as throttled, after a couple of tries", async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetch);

  const result = await settle(() =>
    readWordPress("https://x.test/a", "a read"),
  );

  expect(fetch).toHaveBeenCalledTimes(3);
  expect("error" in result && result.error).toBeInstanceOf(Throttled);
});

test("a refusal that persists ends as throttled, not as an empty answer", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);

  const result = await settle(() =>
    readWordPress("https://x.test/a", "a read"),
  );

  expect(fetch).toHaveBeenCalledTimes(3);
  expect("error" in result && result.error).toBeInstanceOf(Throttled);
});

test("any other status is the caller's to read", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 400 })),
  );

  const result = await settle(() =>
    readWordPress("https://x.test/a", "a read"),
  );

  expect("value" in result && result.value.status).toBe(400);
});

const ARTICLE = "https://theumdhare.com/wp-json/wp/v2/posts?slug=a";
const THROUGH = "/api/wordpress/wp/v2/posts?slug=a";

test("in a browser, a read goes through HareWare, where WordPress's cache answers", async () => {
  vi.stubGlobal("document", {});
  const fetch = vi.fn().mockResolvedValue(Response.json([1]));
  vi.stubGlobal("fetch", fetch);

  const result = await settle(() => readWordPress(ARTICLE, "a read"));

  expect(fetch.mock.calls.map(([url]) => url)).toEqual([THROUGH]);
  expect("value" in result && result.value.status).toBe(200);
});

test("when HareWare cannot pass it through, the browser asks WordPress itself", async () => {
  vi.stubGlobal("document", {});
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 502 }))
    .mockResolvedValueOnce(Response.json([1]));
  vi.stubGlobal("fetch", fetch);

  const result = await settle(() => readWordPress(ARTICLE, "a read"));

  expect(fetch.mock.calls.map(([url]) => url)).toEqual([THROUGH, ARTICLE]);
  expect("value" in result && result.value.status).toBe(200);
});

test("an answer through HareWare is the caller's to read, as one from WordPress is", async () => {
  vi.stubGlobal("document", {});
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
  vi.stubGlobal("fetch", fetch);

  const result = await settle(() => readWordPress(ARTICLE, "a read"));

  expect(fetch).toHaveBeenCalledTimes(1);
  expect("value" in result && result.value.status).toBe(400);
});

test("a fresh read goes to WordPress itself, past every cache", async () => {
  vi.stubGlobal("document", {});
  const fetch = vi.fn().mockResolvedValue(Response.json([1]));
  vi.stubGlobal("fetch", fetch);

  await settle(() => readWordPress(ARTICLE, "a read", { fresh: true }));

  expect(fetch.mock.calls.map(([url]) => url)).toEqual([ARTICLE]);
});

test("a read takes the request the page already sent, rather than its own", async () => {
  vi.stubGlobal("document", {});
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  globalThis.__early = new Map([
    [
      THROUGH,
      { at: Date.now(), response: Promise.resolve(Response.json([1])) },
    ],
  ]);

  const result = await settle(() => readWordPress(ARTICLE, "a read"));

  expect(fetch).not.toHaveBeenCalled();
  expect("value" in result && result.value.status).toBe(200);
  globalThis.__early = undefined;
});

/* reads that start together must still reach WordPress half a second apart,
   or they are the burst it refuses */
test("direct reads started together are sent half a second apart", async () => {
  vi.useFakeTimers();
  const sent: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      sent.push(Date.now());
      return Response.json([]);
    }),
  );

  const reads = Promise.all(
    ["a", "b", "c"].map((name) =>
      readWordPress(`https://x.test/${name}`, name),
    ),
  );
  await vi.runAllTimersAsync();
  await reads;

  expect(sent).toHaveLength(3);
  expect(sent[1]! - sent[0]!).toBeGreaterThanOrEqual(500);
  expect(sent[2]! - sent[1]!).toBeGreaterThanOrEqual(500);
});

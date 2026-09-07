import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { notion, together } from "./client";

/*
  the retry is tested through `notion()` rather than through `sendPatiently`
  alone: a helper can be perfectly tested while nothing calls it, and the whole
  value of putting this in the client is that every caller already goes through
  it. Delete the `sendPatiently` wrapper in `notion()` and the first two tests
  here go red.
*/

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const limited = (retryAfter?: string) =>
  new Response('{"message":"rate limited"}', {
    status: 429,
    headers: retryAfter ? { "retry-after": retryAfter } : {},
  });

test("a rate-limited read is retried and answers with notion's next reply", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(limited("1"))
    .mockResolvedValueOnce(json({ results: ["a row"] }));
  vi.stubGlobal("fetch", fetch);

  const answered = notion("data_sources/x/query", "secret");
  await vi.advanceTimersByTimeAsync(2_000);

  expect(await answered).toEqual({ results: ["a row"] });
  expect(fetch).toHaveBeenCalledTimes(2);
});

/* the failure the room actually saw: a page error naming a status code, with
   nothing in it to say the integration was over its budget */
test("a read that stays rate limited fails saying so, not with a bare 429", async () => {
  const fetch = vi.fn().mockResolvedValue(limited());
  vi.stubGlobal("fetch", fetch);

  const caught = notion("databases/x", "secret").catch(
    (thrown: unknown) => thrown,
  );
  await vi.advanceTimersByTimeAsync(60_000);

  const thrown = await caught;
  expect((thrown as Error).message).toMatch(/rate limited/);
  expect((thrown as Error).message).toContain("databases/x");
});

/* the token is in every request's headers and in none of its errors */
test("a refusal never echoes the token", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("no", { status: 403 })),
  );

  const thrown = (await notion("databases/x", "secret-token").catch(
    (error: unknown) => error,
  )) as Error;

  expect(thrown.message).not.toContain("secret-token");
});

test("together never has more than two notion reads in flight", async () => {
  vi.useRealTimers();

  let running = 0;
  let most = 0;
  const read = () => async () => {
    running++;
    most = Math.max(most, running);
    await new Promise((done) => setTimeout(done, 5));
    running--;
    return "read";
  };

  await together([read(), read(), read(), read(), read()]);

  expect(most).toBe(2);
});

/* concurrent, not serial: bounding the burst may not cost a round trip per
   read on a page that is re-read on every visit */
test("together runs them concurrently, and answers in the order asked", async () => {
  vi.useRealTimers();

  const slow = async () => {
    await new Promise((done) => setTimeout(done, 20));
    return "slow";
  };
  const quick = async () => "quick";

  const started = Date.now();
  const answers = await together([slow, quick]);

  expect(answers).toEqual(["slow", "quick"]);
  expect(Date.now() - started).toBeLessThan(40);
});

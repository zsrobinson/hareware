import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RateLimited, retryAfterMs, sendPatiently } from "./rate-limit";

/*
  the waits are real `setTimeout`s, so the clock is faked and advanced by hand.
  that is also what lets `Retry-After` be tested as a *duration* rather than as
  "it retried eventually": the assertion is that nothing goes out before the
  server said it could.
*/
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const limited = (retryAfter?: string) =>
  new Response("rate limited", {
    status: 429,
    headers: retryAfter ? { "retry-after": retryAfter } : {},
  });

test("a 429 then a success comes back as the success", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(limited())
    .mockResolvedValueOnce(new Response("ok", { status: 200 }));

  const answered = sendPatiently(send, "notion databases/x");
  await vi.advanceTimersByTimeAsync(10_000);

  expect((await answered).status).toBe(200);
  expect(send).toHaveBeenCalledTimes(2);
});

test("nothing is sent again until Retry-After has elapsed", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(limited("2"))
    .mockResolvedValue(new Response("ok", { status: 200 }));

  const answered = sendPatiently(send, "notion databases/x");

  /* the default backoff is half a second, so a retry here would mean the
     header was ignored rather than merely that the timing is loose */
  await vi.advanceTimersByTimeAsync(1_900);
  expect(send).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(200);
  expect(send).toHaveBeenCalledTimes(2);

  expect((await answered).status).toBe(200);
});

test("a Retry-After longer than the cap does not hold the page for a minute", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(limited("60"))
    .mockResolvedValue(new Response("ok", { status: 200 }));

  const answered = sendPatiently(send, "notion databases/x");
  await vi.advanceTimersByTimeAsync(5_000);

  expect(send).toHaveBeenCalledTimes(2);
  expect((await answered).status).toBe(200);
});

test("running out of retries throws an error that says it was rate limited", async () => {
  const send = vi.fn().mockResolvedValue(limited());

  const answered = sendPatiently(send, "notion databases/x");
  const caught = answered.catch((thrown: unknown) => thrown);
  await vi.advanceTimersByTimeAsync(60_000);

  const thrown = await caught;
  expect(thrown).toBeInstanceOf(RateLimited);
  expect((thrown as Error).message).toMatch(/rate limited/);
  /* and it names the call, so the log line says which read gave up */
  expect((thrown as Error).message).toContain("notion databases/x");

  /* the first attempt plus the bounded retries, and then it stops */
  expect(send).toHaveBeenCalledTimes(4);
});

/* only a 429 is retried: a 403 retried three times is three requests spent on
   the same refusal, and the caller is what knows what a status means */
test("any other failure is handed straight back", async () => {
  const send = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));

  const response = await sendPatiently(send, "notion databases/x");

  expect(response.status).toBe(403);
  expect(send).toHaveBeenCalledTimes(1);
});

test("a Retry-After that is not a number is absence, not NaN in a timer", () => {
  expect(retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined();
  expect(retryAfterMs("")).toBeUndefined();
  expect(retryAfterMs(null)).toBeUndefined();
  expect(retryAfterMs("-1")).toBeUndefined();
  expect(retryAfterMs("1.5")).toBe(1500);
});

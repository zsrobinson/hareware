import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { sendPatiently } from "./rate-limit";

/* the clock is faked, so `Retry-After` is tested as a duration */
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

  /* the default backoff is shorter, so a retry here would mean the header was ignored */
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
  expect((thrown as Error).message).toMatch(/rate limited/);
  /* and it names the call, so the log line says which read gave up */
  expect((thrown as Error).message).toContain("notion databases/x");

  /* the first attempt plus the bounded retries, and then it stops */
  expect(send).toHaveBeenCalledTimes(4);
});

test("any other failure is handed straight back", async () => {
  const send = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));

  const response = await sendPatiently(send, "notion databases/x");

  expect(response.status).toBe(403);
  expect(send).toHaveBeenCalledTimes(1);
});

/* a date-form or malformed header falls back to the backoff; NaN would fire at once */
test.each([
  ["Wed, 21 Oct 2026 07:28:00 GMT", 500],
  ["", 500],
  ["-1", 500],
  ["1.5", 1_500],
])("a Retry-After of %j waits %ims", async (header, waits) => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("rate limited", {
        status: 429,
        headers: { "retry-after": header },
      }),
    )
    .mockResolvedValue(new Response("ok", { status: 200 }));

  const answered = sendPatiently(send, "notion databases/x");

  await vi.advanceTimersByTimeAsync(waits - 1);
  expect(send).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1);
  expect(send).toHaveBeenCalledTimes(2);
  expect((await answered).status).toBe(200);
});

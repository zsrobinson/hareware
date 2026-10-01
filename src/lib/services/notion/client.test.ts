import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  notion,
  propertyOfType,
  queryAll,
  relationIds,
  together,
} from "./client";

/* through `notion()`, so removing its `sendPatiently` turns the first two red */

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

const serverError = (status: number, requestId = "notion-request") =>
  new Response(
    JSON.stringify({
      code: "internal_server_error",
      message: "Cross-cell memcached access is not allowed",
      request_id: requestId,
    }),
    { status },
  );

test.each([500, 502, 503, 504])(
  "a schema read recovers after a Notion %i",
  async (status) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(serverError(status))
      .mockResolvedValueOnce(json({ properties: { Date: { type: "date" } } }));
    vi.stubGlobal("fetch", fetch);

    const answered = propertyOfType("meetings", "secret", "date").catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(500);

    expect(await answered).toBe("Date");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[1].method).toBe("GET");
  },
);

test.each([500, 502, 503, 504])(
  "a POST query recovers after a Notion %i without changing its filter",
  async (status) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(serverError(status))
      .mockResolvedValueOnce(json({ results: ["a row"], has_more: false }));
    vi.stubGlobal("fetch", fetch);
    const filter = { property: "Name", title: { equals: "Someone" } };

    const answered = queryAll("members", "secret", { filter }).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(500);

    expect(await answered).toEqual(["a row"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ page_size: 100, filter }),
    });
  },
);

test("a persistent server failure backs off three times and preserves the final error", async () => {
  const fetch = vi.fn(async () =>
    serverError(500, `request-${fetch.mock.calls.length}`),
  );
  vi.stubGlobal("fetch", fetch);
  const caught = notion("data_sources/meetings", "secret-token").catch(
    (error: unknown) => error,
  );

  await vi.advanceTimersByTimeAsync(499);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(999);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1_999);
  expect(fetch).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(4);

  const thrown = (await caught) as Error;
  expect(thrown.message).toContain(
    "notion returned 500 for data_sources/meetings",
  );
  expect(thrown.message).toContain(
    "Cross-cell memcached access is not allowed",
  );
  expect(thrown.message).toContain("request-4");
  expect(thrown.message).not.toContain("secret-token");
});

test.each([500, 502, 503, 504])(
  "a Notion %i never retries page creation or updates",
  async (status) => {
    const fetch = vi.fn(async () => serverError(status));
    vi.stubGlobal("fetch", fetch);

    await expect(notion("pages", "secret", { properties: {} })).rejects.toThrow(
      `notion returned ${status}`,
    );
    expect(fetch).toHaveBeenCalledTimes(1);

    await expect(
      notion("pages/member", "secret", { properties: {} }, "PATCH"),
    ).rejects.toThrow(`notion returned ${status}`);
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);

test.each([400, 401, 403, 404, 409])(
  "a read refused with %i fails without retrying",
  async (status) => {
    const fetch = vi.fn(async () => new Response("refused", { status }));
    vi.stubGlobal("fetch", fetch);

    await expect(notion("data_sources/meetings", "secret")).rejects.toThrow(
      `notion returned ${status}`,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

test("a server retry still waits out a subsequent rate limit", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(serverError(500))
    .mockResolvedValueOnce(limited("1"))
    .mockResolvedValueOnce(json({ results: [] }));
  vi.stubGlobal("fetch", fetch);

  const answered = notion("data_sources/members/query", "secret", {}).catch(
    (error: unknown) => error,
  );
  await vi.advanceTimersByTimeAsync(500);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(999);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);

  expect(await answered).toEqual({ results: [] });
  expect(fetch).toHaveBeenCalledTimes(3);
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

test("queryAll follows every page, not just the first", async () => {
  const bodies: { start_cursor?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as {
        start_cursor?: string;
      };
      bodies.push(body);

      return body.start_cursor
        ? json({ results: ["c"], has_more: false })
        : json({ results: ["a", "b"], has_more: true, next_cursor: "second" });
    }),
  );

  expect(await queryAll("source", "secret")).toEqual(["a", "b", "c"]);
  expect(bodies.map((body) => body.start_cursor)).toEqual([
    undefined,
    "second",
  ]);
});

test("queryAll refuses a page that says has_more but gives no cursor", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({ results: ["a"], has_more: true, next_cursor: null }),
    ),
  );

  await expect(queryAll("source", "secret")).rejects.toThrow(/no cursor/);
});

test("a relation cut short with no id to read the rest by is refused", async () => {
  const fetched = vi.fn();
  vi.stubGlobal("fetch", fetched);

  await expect(
    relationIds("page", { relation: [{ id: "a" }], has_more: true }, "secret"),
  ).rejects.toThrow(/cut short/);
  expect(fetched).not.toHaveBeenCalled();
});

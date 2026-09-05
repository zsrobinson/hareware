import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { followUp, MAX_CONTENT, TOKEN_LIFETIME_MS } from "./follow-up";

/**
 * the json body of the one request that was sent.
 *
 * `RequestInit["body"]` is a union that includes streams and blobs, so reading
 * it needs a narrowing somewhere — once here rather than at every assertion
 */
function sentBody(mock: { mock: { calls: unknown[] } }) {
  const [, init] = mock.mock.calls[0] as [string, RequestInit];

  return typeof init.body === "string" ? init.body : "";
}

const APPLICATION = "app-1";
const TOKEN = "interaction-token";

const okResponse = () => Response.json({ id: "message-1" });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

test("it patches the original deferred message", async () => {
  const fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);

  const result = await followUp(APPLICATION, TOKEN, "Set to Section Edited.");

  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe(
    `https://discord.com/api/v10/webhooks/${APPLICATION}/${TOKEN}/messages/@original`,
  );
  expect(init.method).toBe("PATCH");
  expect(JSON.parse(init.body as string)).toEqual({
    content: "Set to Section Edited.",
  });
  expect(result.outcome).toBe("ok");
});

test("it sends no authorization header, because the token is the credential", async () => {
  const fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);

  await followUp(APPLICATION, TOKEN, "done");

  const headers = (
    fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  )[1].headers as Record<string, string>;

  expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain(
    "authorization",
  );
});

test("empty content still sends a message rather than nothing", async () => {
  /*
    a deferred interaction that never follows up shows "HareWare is thinking…"
    forever, so there is no path here that sends nothing
  */
  const fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);

  const result = await followUp(APPLICATION, TOKEN, "   ");

  const body = JSON.parse(sentBody(fetchMock));
  expect(body.content.length).toBeGreaterThan(0);
  expect(result.outcome).toBe("ok");
});

test("content longer than discord accepts is truncated rather than rejected", async () => {
  const fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);

  await followUp(APPLICATION, TOKEN, "x".repeat(MAX_CONTENT + 500));

  const body = JSON.parse(sentBody(fetchMock));
  expect(body.content.length).toBe(MAX_CONTENT);
});

test("discord refusing the follow-up is a failed result, not a throw", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("Invalid Webhook Token", { status: 401 })),
  );

  const result = await followUp(APPLICATION, TOKEN, "done");

  expect(result.outcome).toBe("failed");
  // whatever discord said goes in the log; an expired token reads as 401 here
  expect(result.summary).toContain("401");
  expect(result.summary).toContain("Invalid Webhook Token");
});

test("an unreachable discord is a failed result, not a throw", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network down");
    }),
  );

  const result = await followUp(APPLICATION, TOKEN, "done");

  expect(result.outcome).toBe("failed");
  expect(result.summary).toContain("network down");
});

test("a missing application id or token is misconfigured rather than a bad request", async () => {
  const fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);

  expect((await followUp("", TOKEN, "done")).outcome).toBe("misconfigured");
  expect((await followUp(APPLICATION, "", "done")).outcome).toBe(
    "misconfigured",
  );
  // and nothing was sent to a url with an empty segment in it
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the token's lifetime is the fifteen minutes discord gives it", () => {
  expect(TOKEN_LIFETIME_MS).toBe(15 * 60 * 1000);
});

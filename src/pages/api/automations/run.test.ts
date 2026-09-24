import { afterEach, expect, test, vi } from "vitest";

/* `cloudflare:workers` exists only in workerd, so it is stubbed per test */
const workers = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("cloudflare:workers", () => workers);

const { POST } = await import("./run");

const SECRET = "a".repeat(64);

const call = (env: Record<string, string>, auth?: string, query = "") => {
  Object.assign(workers.env, env);
  return (POST as (c: unknown) => Promise<Response>)({
    request: new Request(`https://hareware.test/api/automations/run${query}`, {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    }),
  });
};

afterEach(() => {
  for (const key of Object.keys(workers.env)) delete workers.env[key];
});

test("does not exist until a secret is configured", async () => {
  expect((await call({})).status).toBe(404);
});

test("refuses a request with no credentials", async () => {
  const response = await call({ REMINDERS_TRIGGER_SECRET: SECRET });
  expect(response.status).toBe(401);
});

test("refuses the wrong secret", async () => {
  const response = await call(
    { REMINDERS_TRIGGER_SECRET: SECRET },
    `Bearer ${"b".repeat(64)}`,
  );
  expect(response.status).toBe(401);
});

test("refuses a prefix of the right secret", async () => {
  const response = await call(
    { REMINDERS_TRIGGER_SECRET: SECRET },
    `Bearer ${"a".repeat(63)}`,
  );
  expect(response.status).toBe(401);
});

/* the panel's own refusal: a Discord outage is not "unauthorized" */
test("says it could not check a signed-in editor during an outage", async () => {
  const { createSessionCookie } = await import("~/lib/session");
  const secret = "s".repeat(32);
  const cookie = (
    await createSessionCookie({ discordUserId: "342850506328117249" }, secret)
  ).split(";")[0]!;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network");
    }),
  );
  Object.assign(workers.env, {
    REMINDERS_TRIGGER_SECRET: SECRET,
    SESSION_SECRET: secret,
    DISCORD_BOT_TOKEN: "bot",
  });

  const response = await (POST as (c: unknown) => Promise<Response>)({
    request: new Request("https://hareware.test/api/automations/run", {
      method: "POST",
      headers: { cookie },
    }),
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();

  expect(response.status).toBe(503);
});

/* with nothing configured, each automation reports itself unset offline */
test("runs both reminders for a correct secret", async () => {
  const response = await call(
    { REMINDERS_TRIGGER_SECRET: SECRET },
    `Bearer ${SECRET}`,
  );

  expect(response.status).toBe(200);
  const report = await response.json();
  expect(Object.keys(report as object)).toEqual([
    "meeting-reminder",
    "social-ping",
    "application-sync",
  ]);
});

test("?only=meeting runs just the meeting reminder", async () => {
  const response = await call(
    { REMINDERS_TRIGGER_SECRET: SECRET },
    `Bearer ${SECRET}`,
    "?only=meeting",
  );

  const report = (await response.json()) as Record<string, string>;
  expect(report["social-ping"]).toBe("not requested");
  expect(report["meeting-reminder"]).not.toBe("not requested");
});

test("rejects an unknown reminder name", async () => {
  const response = await call(
    { REMINDERS_TRIGGER_SECRET: SECRET },
    `Bearer ${SECRET}`,
    "?only=nonsense",
  );

  expect(response.status).toBe(400);
});

test("?dry=1 reports without posting anything", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await call(
    {
      REMINDERS_TRIGGER_SECRET: SECRET,
      DISCORD_BOT_TOKEN: "bot-token",
    },
    `Bearer ${SECRET}`,
    "?dry=1&only=social",
  );

  expect(response.status).toBe(200);
  // the wordpress feed may be read; discord must not be posted to
  for (const [url] of fetchMock.mock.calls) {
    expect(String(url)).not.toContain("discord.com");
  }
  log.mockRestore();
  vi.unstubAllGlobals();
});

test("a run without ?dry may post", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const seen: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ components: [{}, {}] }));
    }),
  );

  await call(
    {
      REMINDERS_TRIGGER_SECRET: SECRET,
      DISCORD_BOT_TOKEN: "bot-token",
    },
    `Bearer ${SECRET}`,
    "?only=social",
  );

  // the feed is read either way; the point is that discord is reachable here
  expect(seen.some((u) => u.includes("theumdhare.com"))).toBe(true);
  log.mockRestore();
  vi.unstubAllGlobals();
});

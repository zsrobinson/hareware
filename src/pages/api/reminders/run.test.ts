import { afterEach, expect, test, vi } from "vitest";

/*
  the route reads its secret from `cloudflare:workers`, which only exists inside
  workerd — astro v6 removed `locals.runtime.env`, whose getter now throws. the
  module is stubbed with a mutable object so each test can set the environment
*/
const workers = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("cloudflare:workers", () => workers);

const { POST } = await import("./run");

const SECRET = "a".repeat(64);

const call = (env: Record<string, string>, auth?: string, query = "") => {
  Object.assign(workers.env, env);
  return (POST as (c: unknown) => Promise<Response>)({
    request: new Request(`https://hareware.test/api/reminders/run${query}`, {
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

/*
  with no webhook urls set the reminders report themselves unset without
  reaching the network, which is exactly what a run should say here
*/
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

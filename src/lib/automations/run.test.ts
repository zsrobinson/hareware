import { afterEach, expect, test, vi } from "vitest";

const social = vi.fn(async () => ({ outcome: "ok", summary: "social ran" }));

vi.mock("./social", () => ({
  sendSocialPing: (...a: unknown[]) => social(...(a as [])),
}));

const reportFailure = vi.fn<(...args: unknown[]) => Promise<void>>(
  async () => undefined,
);

const record = vi.fn<(...args: unknown[]) => Promise<void>>(
  async () => undefined,
);
vi.mock("~/lib/log", () => ({
  record: (...a: unknown[]) => record(...(a as [])),
}));
vi.mock("./alert", () => ({
  reportFailure: (...a: unknown[]) => reportFailure(...(a as [])),
}));

const { runScheduled, runAutomations, ALL } = await import("./run");

/** 12:00 utc is 8am eastern in summer; 13:00 utc is 9am */
const tick = (utc: string) =>
  ({
    scheduledTime: Date.parse(utc),
    cron: "0 * * * *",
  }) as ScheduledController;
const EIGHT_AM = tick("2026-09-03T12:00:00Z");
const NINE_AM = tick("2026-09-03T13:00:00Z");
const now = new Date("2026-09-03T12:00:00Z");

afterEach(() => {
  social.mockClear();
  reportFailure.mockClear();
  record.mockClear();
  vi.restoreAllMocks();
});

test("the cron runs the reminder at its hour, with the tick's instant", async () => {
  await runScheduled(EIGHT_AM, {} as Env);
  expect(social).toHaveBeenCalledOnce();
  expect((social.mock.calls[0] as unknown[])[1]).toEqual(now);
});

/*
  the reminder is due when the eastern hour matches, so a second schedule
  ticking inside 8am would ping the club on every tick
*/
test("another schedule never fires the reminder, even at its hour", async () => {
  await runScheduled(
    {
      scheduledTime: Date.parse("2026-09-03T12:00:00Z"),
      cron: "* * * * *",
    } as ScheduledController,
    {} as Env,
  );
  expect(social).not.toHaveBeenCalled();
});

test("the cron does nothing at any other hour", async () => {
  await runScheduled(NINE_AM, {} as Env);
  expect(social).not.toHaveBeenCalled();
});

test("REMINDERS_IGNORE_HOUR runs it whatever the hour", async () => {
  await runScheduled(NINE_AM, { REMINDERS_IGNORE_HOUR: "1" } as unknown as Env);
  expect(social).toHaveBeenCalledOnce();
});

test("a failure before dispatch is logged rather than escaping waitUntil", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  social.mockImplementationOnce(() => {
    throw new Error("thrown synchronously");
  });

  await expect(runScheduled(EIGHT_AM, {} as Env)).resolves.toBeUndefined();
  expect(error).toHaveBeenCalled();
});

test("runAutomations reports what it did, and a throw as a failure", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  expect(await runAutomations({} as Env, now, ALL)).toEqual({
    "social-ping": "social ran",
  });

  social.mockRejectedValueOnce(new Error("discord is down"));
  expect((await runAutomations({} as Env, now, ALL))["social-ping"]).toContain(
    "discord is down",
  );
});

test("reports a failed cron run, naming the automation and the reason", async () => {
  social.mockRejectedValueOnce(new Error("wordpress returned 502"));
  vi.spyOn(console, "error").mockImplementation(() => {});

  await runAutomations({} as Env, now, ALL, "cron");

  const [, automation, summary] = reportFailure.mock.calls[0] as [
    Env,
    { action: string },
    string,
  ];
  expect(automation.action).toBe("social-ping");
  expect(summary).toContain("wordpress returned 502");
});

test("says nothing about a cron run that worked", async () => {
  await runAutomations({} as Env, now, ALL, "cron");
  expect(reportFailure).not.toHaveBeenCalled();
});

test("leaves a failed manual run to whoever triggered it", async () => {
  social.mockRejectedValueOnce(new Error("boom"));
  vi.spyOn(console, "error").mockImplementation(() => {});

  const report = await runAutomations({} as Env, now, ALL, "manual");

  // the response already tells them, so a channel post would say it twice
  expect(reportFailure).not.toHaveBeenCalled();
  expect(report["social-ping"]).toContain("boom");
});

/* `{} as Env` makes `record()` return early, so the log is mocked to see the row */
test("records the outcome the automation returned, and who fired it", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  social.mockResolvedValueOnce({
    outcome: "skipped",
    summary: "nothing published",
  });

  await runAutomations(
    { DB: {} } as Env,
    now,
    ALL,
    "manual",
    "342850506328117249",
  );

  const row = record.mock.calls[0]![1] as { outcome: string; actor?: string };
  expect(row.outcome).toBe("skipped");
  expect(row.actor).toBe("342850506328117249");
});

test("writes no row for a dry run, which posted nothing", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});

  await runAutomations(
    { DB: {}, REMINDERS_DRY_RUN: "1" } as Env,
    now,
    ALL,
    "cron",
  );

  expect(record).not.toHaveBeenCalled();
});

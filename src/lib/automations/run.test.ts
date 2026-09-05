import { afterEach, expect, test, vi } from "vitest";

/* the automations return an outcome now, not a bare string — a run that found
   nothing to do is `skipped`, not `ok` */
const meeting = vi.fn(async () => ({ outcome: "ok", summary: "meeting ran" }));
const social = vi.fn(async () => ({ outcome: "ok", summary: "social ran" }));

vi.mock("./meeting", () => ({
  sendMeetingReminder: (...a: unknown[]) => meeting(...(a as [])),
}));
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
const at = (utc: string) =>
  ({
    scheduledTime: Date.parse(utc),
    cron: "0 * * * *",
  }) as ScheduledController;
const EIGHT_AM = at("2026-09-03T12:00:00Z");
const NINE_AM = at("2026-09-03T13:00:00Z");
const eastern = { date: "2026-09-03", hour: 8, weekday: "Thursday" };

afterEach(() => {
  meeting.mockClear();
  social.mockClear();
  reportFailure.mockClear();
  record.mockClear();
  vi.restoreAllMocks();
});

test("the cron runs both at the automation hour", async () => {
  await runScheduled(EIGHT_AM, {} as Env);
  expect(meeting).toHaveBeenCalledOnce();
  expect(social).toHaveBeenCalledOnce();
});

/*
  the index syncs every minute, and the reminders are due when the eastern hour
  matches — so without a check on which schedule woke us, every minute of 8am
  would be a fresh 8am and the club would be pinged sixty times. messages can be
  deleted; the pings they send cannot
*/
test("the minute cron never fires a reminder, even at the reminder hour", async () => {
  const everyMinute = {
    scheduledTime: Date.parse("2026-09-03T12:00:00Z"),
    cron: "* * * * *",
  } as ScheduledController;

  await runScheduled(everyMinute, {} as Env);

  expect(meeting).not.toHaveBeenCalled();
  expect(social).not.toHaveBeenCalled();
});

test("nor does REMINDERS_IGNORE_HOUR turn the minute cron into sixty runs", async () => {
  /* the switch ignores the hour, and must never ignore the schedule: it exists
     to see a reminder without waiting for 8am, not to see sixty */
  const everyMinute = {
    scheduledTime: Date.parse("2026-09-03T15:00:00Z"),
    cron: "* * * * *",
  } as ScheduledController;

  await runScheduled(everyMinute, {
    REMINDERS_IGNORE_HOUR: "1",
  } as unknown as Env);

  expect(meeting).not.toHaveBeenCalled();
  expect(social).not.toHaveBeenCalled();
});

test("the cron runs neither at any other hour", async () => {
  await runScheduled(NINE_AM, {} as Env);
  expect(meeting).not.toHaveBeenCalled();
  expect(social).not.toHaveBeenCalled();
});

test("REMINDERS_IGNORE_HOUR runs both whatever the hour", async () => {
  await runScheduled(NINE_AM, { REMINDERS_IGNORE_HOUR: "1" } as unknown as Env);
  expect(meeting).toHaveBeenCalledOnce();
  expect(social).toHaveBeenCalledOnce();
});

test("one reminder throwing does not stop the other", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  meeting.mockRejectedValueOnce(new Error("notion is down"));

  await runScheduled(EIGHT_AM, {} as Env);

  expect(social).toHaveBeenCalledOnce();
});

test("a failure before dispatch is logged rather than escaping waitUntil", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  meeting.mockImplementationOnce(() => {
    throw new Error("thrown synchronously");
  });

  await expect(runScheduled(EIGHT_AM, {} as Env)).resolves.toBeUndefined();
  expect(error).toHaveBeenCalled();
});

test("runReminders runs only what was asked for", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});

  await runAutomations({} as Env, eastern, new Set(["meeting"] as const));

  expect(meeting).toHaveBeenCalledOnce();
  expect(social).not.toHaveBeenCalled();
});

test("runAutomations reports what each one did", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});

  const report = await runAutomations({} as Env, eastern, ALL);

  expect(report).toEqual({
    "meeting-reminder": "meeting ran",
    "social-ping": "social ran",
  });
});

test("runAutomations reports a failure rather than throwing", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  social.mockRejectedValueOnce(new Error("discord is down"));

  const report = await runAutomations({} as Env, eastern, ALL);

  expect(report["social-ping"]).toContain("failed");
  expect(report["meeting-reminder"]).toBe("meeting ran");
});

test("reports a failed cron run, naming the automation and the reason", async () => {
  meeting.mockRejectedValueOnce(new Error("notion returned 502"));
  vi.spyOn(console, "error").mockImplementation(() => {});

  await runAutomations({} as Env, eastern, ALL, "cron");

  expect(reportFailure).toHaveBeenCalledOnce();
  /* the automation itself, not its action string — so the alert can read the
     friendly name off it rather than keeping a second table of names */
  const [, automation, summary] = reportFailure.mock.calls[0] as [
    Env,
    { action: string },
    string,
  ];
  expect(automation.action).toBe("meeting-reminder");
  expect(summary).toContain("notion returned 502");
});

test("says nothing about a cron run that worked", async () => {
  await runAutomations({} as Env, eastern, ALL, "cron");

  expect(reportFailure).not.toHaveBeenCalled();
});

test("leaves a failed manual run to whoever triggered it", async () => {
  meeting.mockRejectedValueOnce(new Error("boom"));
  vi.spyOn(console, "error").mockImplementation(() => {});

  const report = await runAutomations({} as Env, eastern, ALL, "manual");

  // the response already tells them, so a channel post would say it twice
  expect(reportFailure).not.toHaveBeenCalled();
  expect(report["meeting-reminder"]).toContain("boom");
});

test("reports each reminder that failed, independently", async () => {
  meeting.mockRejectedValueOnce(new Error("notion down"));
  social.mockRejectedValueOnce(new Error("wordpress down"));
  vi.spyOn(console, "error").mockImplementation(() => {});

  await runAutomations({} as Env, eastern, ALL, "cron");

  expect(reportFailure).toHaveBeenCalledTimes(2);
});

/*
  what actually reaches the row.

  every test above passes `{} as Env`, so `record()` short-circuits on the
  missing DB and the write path — the semantics this branch is entirely about —
  was exercised by nothing. mocking the log rather than D1 keeps that cheap.
*/
test("records the outcome the automation returned, not whether it threw", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  meeting.mockResolvedValueOnce({
    outcome: "skipped",
    summary: "no meeting today",
  });
  social.mockResolvedValueOnce({
    outcome: "misconfigured",
    summary: "social ping unset: X",
  });

  await runAutomations({ DB: {} } as Env, eastern, ALL, "cron");

  const outcomes = record.mock.calls.map(
    (c) => (c[1] as { outcome: string }).outcome,
  );
  expect(outcomes).toEqual(["skipped", "misconfigured"]);
});

test("records who fired a manual run", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});

  await runAutomations(
    { DB: {} } as Env,
    eastern,
    new Set(["meeting"] as const),
    "manual",
    "342850506328117249",
  );

  expect((record.mock.calls[0]?.[1] as { actor?: string }).actor).toBe(
    "342850506328117249",
  );
});

test("writes no row for a dry run, which posted nothing", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});

  await runAutomations(
    { DB: {}, REMINDERS_DRY_RUN: "1" } as Env,
    eastern,
    ALL,
    "cron",
  );

  // a green row for a message that never went out is the distinction the
  // widened outcomes exist to make, undone
  expect(record).not.toHaveBeenCalled();
});

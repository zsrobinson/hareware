import { afterEach, expect, test, vi } from "vitest";

const meeting = vi.fn(async () => "meeting ran");
const social = vi.fn(async () => "social ran");

vi.mock("./meeting", () => ({
  sendMeetingReminder: (...a: unknown[]) => meeting(...(a as [])),
}));
vi.mock("./social", () => ({
  sendSocialPing: (...a: unknown[]) => social(...(a as [])),
}));

const reportFailure = vi.fn<(...args: unknown[]) => Promise<void>>(
  async () => undefined,
);
vi.mock("./alert", () => ({
  reportFailure: (...a: unknown[]) => reportFailure(...(a as [])),
}));

const { runScheduled, runReminders } = await import("./run");

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
  vi.restoreAllMocks();
});

test("the cron runs both at the reminder hour", async () => {
  await runScheduled(EIGHT_AM, {} as Env);
  expect(meeting).toHaveBeenCalledOnce();
  expect(social).toHaveBeenCalledOnce();
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

  await runReminders({} as Env, eastern, { meeting: true, social: false });

  expect(meeting).toHaveBeenCalledOnce();
  expect(social).not.toHaveBeenCalled();
});

test("runReminders reports what each one did", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});

  const report = await runReminders({} as Env, eastern, {
    meeting: true,
    social: true,
  });

  expect(report).toEqual({
    "meeting-reminder": "meeting ran",
    "social-ping": "social ran",
  });
});

test("runReminders reports a failure rather than throwing", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  social.mockRejectedValueOnce(new Error("discord is down"));

  const report = await runReminders({} as Env, eastern, {
    meeting: true,
    social: true,
  });

  expect(report["social-ping"]).toContain("failed");
  expect(report["meeting-reminder"]).toBe("meeting ran");
});

test("reports a failed cron run, naming the reminder and the reason", async () => {
  meeting.mockRejectedValueOnce(new Error("notion returned 502"));
  vi.spyOn(console, "error").mockImplementation(() => {});

  await runReminders(
    {} as Env,
    eastern,
    { meeting: true, social: true },
    "cron",
  );

  expect(reportFailure).toHaveBeenCalledOnce();
  const [, action, summary] = reportFailure.mock.calls[0] as [
    Env,
    string,
    string,
  ];
  expect(action).toBe("meeting-reminder");
  expect(summary).toContain("notion returned 502");
});

test("says nothing about a cron run that worked", async () => {
  await runReminders(
    {} as Env,
    eastern,
    { meeting: true, social: true },
    "cron",
  );

  expect(reportFailure).not.toHaveBeenCalled();
});

test("leaves a failed manual run to whoever triggered it", async () => {
  meeting.mockRejectedValueOnce(new Error("boom"));
  vi.spyOn(console, "error").mockImplementation(() => {});

  const report = await runReminders(
    {} as Env,
    eastern,
    { meeting: true, social: true },
    "manual",
  );

  // the response already tells them, so a channel post would say it twice
  expect(reportFailure).not.toHaveBeenCalled();
  expect(report["meeting-reminder"]).toContain("boom");
});

test("reports each reminder that failed, independently", async () => {
  meeting.mockRejectedValueOnce(new Error("notion down"));
  social.mockRejectedValueOnce(new Error("wordpress down"));
  vi.spyOn(console, "error").mockImplementation(() => {});

  await runReminders(
    {} as Env,
    eastern,
    { meeting: true, social: true },
    "cron",
  );

  expect(reportFailure).toHaveBeenCalledTimes(2);
});

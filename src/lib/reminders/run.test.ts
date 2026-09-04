import { afterEach, expect, test, vi } from "vitest";

const meeting = vi.fn(async () => "meeting ran");
const social = vi.fn(async () => "social ran");

vi.mock("./meeting", () => ({ sendMeetingReminder: (...a: unknown[]) => meeting(...(a as [])) }));
vi.mock("./social", () => ({ sendSocialPing: (...a: unknown[]) => social(...(a as [])) }));

const { runScheduled } = await import("./run");

/** 12:00 utc is 8am eastern in summer; 13:00 utc is 9am */
const at = (utc: string) => ({ scheduledTime: Date.parse(utc), cron: "0 * * * *" }) as ScheduledController;
const EIGHT_AM = at("2026-09-03T12:00:00Z");
const NINE_AM = at("2026-09-03T13:00:00Z");

afterEach(() => {
  meeting.mockClear();
  social.mockClear();
  vi.restoreAllMocks();
});

test("runs both at the reminder hour", async () => {
  await runScheduled(EIGHT_AM, {} as Env);
  expect(meeting).toHaveBeenCalledOnce();
  expect(social).toHaveBeenCalledOnce();
});

test("runs neither at any other hour", async () => {
  await runScheduled(NINE_AM, {} as Env);
  expect(meeting).not.toHaveBeenCalled();
  expect(social).not.toHaveBeenCalled();
});

test("REMINDERS_IGNORE_HOUR runs both whatever the hour", async () => {
  await runScheduled(NINE_AM, { REMINDERS_IGNORE_HOUR: "1" } as Env);
  expect(meeting).toHaveBeenCalledOnce();
  expect(social).toHaveBeenCalledOnce();
});

test("forcing one reminder leaves the other alone", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});

  await runScheduled(NINE_AM, { REMINDERS_FORCE_MEETING: "1" } as Env);

  expect(meeting).toHaveBeenCalledOnce();
  expect(social).not.toHaveBeenCalled();
});

test("forcing the social ping leaves the meeting alone", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});

  await runScheduled(NINE_AM, { REMINDERS_FORCE_SOCIAL: "1" } as Env);

  expect(social).toHaveBeenCalledOnce();
  expect(meeting).not.toHaveBeenCalled();
});

/*
  a forced flag is standing state and fires every hour until removed, so it has
  to be impossible to miss in the log
*/
test("a forced run says so, every time", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  await runScheduled(NINE_AM, { REMINDERS_FORCE_MEETING: "1" } as Env);

  expect(warn).toHaveBeenCalledWith(expect.stringContaining("every hour"));
});

test("says nothing about forcing when the hour is simply due", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  await runScheduled(EIGHT_AM, { REMINDERS_FORCE_MEETING: "1" } as Env);

  expect(warn).not.toHaveBeenCalled();
});

test("one reminder throwing does not stop the other", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  meeting.mockRejectedValueOnce(new Error("notion is down"));

  await runScheduled(EIGHT_AM, {} as Env);

  expect(social).toHaveBeenCalledOnce();
});

test("a failure before dispatch is logged rather than escaping waitUntil", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(
    runScheduled({ scheduledTime: NaN } as ScheduledController, {} as Env),
  ).resolves.toBeUndefined();

  expect(error).toHaveBeenCalled();
});

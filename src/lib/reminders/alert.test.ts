import { afterEach, expect, test, vi } from "vitest";
import { ALERT_CHANNEL_ID } from "./config";

const lastOutcome = vi.fn<() => Promise<"ok" | "failed" | null>>(
  async () => null,
);
/* typed with its arguments so the assertions below can read them back */
const postMessage = vi.fn<(...args: unknown[]) => Promise<void>>(
  async () => undefined,
);

vi.mock("~/lib/log", () => ({
  lastOutcome: (...a: unknown[]) => lastOutcome(...(a as [])),
}));
vi.mock("~/lib/discord/post-message", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postMessage: (...a: unknown[]) => postMessage(...(a as [])),
}));

const { reportFailure } = await import("./alert");

const env = { DISCORD_BOT_TOKEN: "bot" } as Env;

afterEach(() => {
  lastOutcome.mockClear();
  lastOutcome.mockResolvedValue(null);
  postMessage.mockClear();
  vi.restoreAllMocks();
});

test("reports a failure that follows a run that worked", async () => {
  lastOutcome.mockResolvedValue("ok");

  await reportFailure(env, "meeting-reminder", "notion returned 502");

  expect(postMessage).toHaveBeenCalledOnce();
  const [, channel, message] = postMessage.mock.calls[0] as [
    string,
    string,
    { blocks: { content?: string }[]; mentionRoleIds?: string[] },
  ];

  expect(channel).toBe(ALERT_CHANNEL_ID);
  expect(message.blocks[0]?.content).toContain("meeting reminder");
  expect(message.blocks[0]?.content).toContain("notion returned 502");
});

test("stays quiet while a failure is already the standing state", async () => {
  lastOutcome.mockResolvedValue("failed");

  await reportFailure(env, "social-ping", "wordpress unreachable");

  expect(postMessage).not.toHaveBeenCalled();
});

test("speaks up again after a run that recovered", async () => {
  lastOutcome.mockResolvedValue("failed");
  await reportFailure(env, "social-ping", "first");
  expect(postMessage).not.toHaveBeenCalled();

  // the reminder worked once, then broke again
  lastOutcome.mockResolvedValue("ok");
  await reportFailure(env, "social-ping", "second");
  expect(postMessage).toHaveBeenCalledOnce();
});

test("reports when there is no history to compare against", async () => {
  // no D1, or a read that failed: a missing log is a reason to say more
  lastOutcome.mockResolvedValue(null);

  await reportFailure(env, "meeting-reminder", "boom");

  expect(postMessage).toHaveBeenCalledOnce();
});

test("does not mention any role", async () => {
  lastOutcome.mockResolvedValue("ok");

  await reportFailure(env, "meeting-reminder", "boom");

  const [, , message] = postMessage.mock.calls[0] as [
    string,
    string,
    { mentionRoleIds?: string[] },
  ];
  expect(message.mentionRoleIds ?? []).toEqual([]);
});

test("clips a summary too long for a text display", async () => {
  lastOutcome.mockResolvedValue("ok");

  await reportFailure(env, "meeting-reminder", "x".repeat(5000));

  const [, , message] = postMessage.mock.calls[0] as [
    string,
    string,
    { blocks: { content?: string }[] },
  ];
  expect(message.blocks[0]?.content?.length).toBeLessThan(1500);
});

test("says nothing without a bot token", async () => {
  lastOutcome.mockResolvedValue("ok");

  await reportFailure({} as Env, "meeting-reminder", "boom");

  expect(postMessage).not.toHaveBeenCalled();
});

test("never throws, whatever discord does", async () => {
  lastOutcome.mockResolvedValue("ok");
  postMessage.mockRejectedValue(new Error("discord is down"));
  vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(
    reportFailure(env, "meeting-reminder", "boom"),
  ).resolves.toBeUndefined();
});

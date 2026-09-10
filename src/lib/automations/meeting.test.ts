import { afterEach, expect, test, vi } from "vitest";
import { sendMeetingReminder } from "./meeting";
import { MEETING_MENTION_ROLE_ID } from "./config";

const env = {
  NOTION_TOKEN: "secret",
  DISCORD_BOT_TOKEN: "bot-token",
} as unknown as Env;

const today = { date: "2026-09-08", hour: 8, weekday: "Tuesday" };

const meeting = (
  title: string,
  start: string,
  location = "McKeldin 2100E",
  /* ADR 0010 added `Type` to Meetings. Undefined here stands for the rows that
     predate it, which is every row that existed when it was added */
  type?: string,
) => ({
  url: `https://notion.so/${encodeURIComponent(title)}`,
  properties: {
    Name: { type: "title", title: [{ plain_text: title }] },
    Date: { type: "date", date: { start } },
    Location: { type: "rich_text", rich_text: [{ plain_text: location }] },
    ...(type ? { Type: { type: "select", select: { name: type } } } : {}),
  },
});

/** stands in for notion's three calls and discord's one */
function mockNotion(results: unknown[]) {
  const discord = vi.fn();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("discord.com")) {
        discord(JSON.parse(init!.body as string));
        return new Response(JSON.stringify({ components: [{}, {}] }));
      }
      if (url.includes("/query"))
        return new Response(JSON.stringify({ results }));
      if (url.includes("data_sources/"))
        return new Response(
          JSON.stringify({ properties: { Date: { type: "date" } } }),
        );
      return new Response(JSON.stringify({ data_sources: [{ id: "ds" }] }));
    }),
  );

  return discord;
}

afterEach(() => vi.unstubAllGlobals());

test("posts for an editorial board meeting dated today", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting 2026-09-08", "2026-09-08"),
  ]);

  const result = await sendMeetingReminder(env, today);

  expect(result.summary).toContain("posted meeting reminder");
  expect(discord).toHaveBeenCalledOnce();
  expect(discord.mock.calls[0]![0].components[0].content).toContain(
    "**Meeting Tonight**",
  );
});

test("ignores a general body meeting on the same day", async () => {
  const discord = mockNotion([
    meeting("General Body Meeting 2026-09-08", "2026-09-08"),
  ]);

  expect((await sendMeetingReminder(env, today)).summary).toContain(
    "no Editorial Board",
  );
  expect(discord).not.toHaveBeenCalled();
});

test("ignores a magazine design session", async () => {
  const discord = mockNotion([
    meeting("Magazine Design Session", "2026-09-08"),
  ]);

  expect((await sendMeetingReminder(env, today)).summary).toContain(
    "no Editorial Board",
  );
  expect(discord).not.toHaveBeenCalled();
});

test("tolerates the trailing spaces real titles carry", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting 2026-09-08 ", "2026-09-08"),
  ]);

  expect((await sendMeetingReminder(env, today)).summary).toContain("posted");
  expect(discord).toHaveBeenCalledOnce();
});

/*
  the row that broke every earlier attempt: an evening meeting is already
  tomorrow in utc, so a bare-date `equals` and a utc day window both miss it
*/
test("matches an 8pm eastern meeting, which is tomorrow in utc", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting", "2026-09-08T20:00:00.000-04:00"),
  ]);

  expect((await sendMeetingReminder(env, today)).summary).toContain("posted");
  expect(discord.mock.calls[0]![0].components[0].content).toContain("at 8pm");
});

test("ignores a meeting that belongs to another day", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting", "2026-09-09T20:00:00.000-04:00"),
  ]);

  expect((await sendMeetingReminder(env, today)).summary).toContain(
    "no Editorial Board",
  );
  expect(discord).not.toHaveBeenCalled();
});

test("names the location when the row has one", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting", "2026-09-08", "Jimenez 1124"),
  ]);

  await sendMeetingReminder(env, today);
  expect(discord.mock.calls[0]![0].components[0].content).toContain(
    "in Jimenez 1124",
  );
});

test("pings the editorial board", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting", "2026-09-08"),
  ]);

  await sendMeetingReminder(env, today);

  const body = discord.mock.calls[0]![0];
  expect(body.components[0].content).toContain(
    `<@&${MEETING_MENTION_ROLE_ID}>`,
  );
  expect(body.allowed_mentions.roles).toEqual([MEETING_MENTION_ROLE_ID]);
});

test("REMINDERS_NO_PING writes the role's name instead of a mention", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting", "2026-09-08"),
  ]);

  await sendMeetingReminder({ ...env, REMINDERS_NO_PING: "1" }, today);

  // allowed_mentions does not gate a mention inside a components v2 text
  // display, so the markup itself has to go — see post-message.test.ts
  const content = discord.mock.calls[0]![0].components[0].content;
  expect(content).not.toContain("<@&");
  expect(content).toContain("@Editorial Board");
});

test("says what is unset rather than throwing", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const result = await sendMeetingReminder({} as Env, today);

  expect(result.summary).toContain("NOTION_TOKEN");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a dry run says it would post, rather than that it did", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting", "2026-09-08"),
  ]);
  vi.spyOn(console, "log").mockImplementation(() => {});

  const result = await sendMeetingReminder(
    { ...env, REMINDERS_DRY_RUN: "1" },
    today,
  );

  expect(result.summary).toContain("would post");
  expect(discord).not.toHaveBeenCalled();
});

/*
  outcomes, which no test here asserted — every one was mechanically rewritten
  to read `.summary`, so `sendMeetingReminder` could have returned `ok` for a
  day with no meeting and the suite would not have noticed.
*/
test("a day with no meeting is skipped, not ok", async () => {
  mockNotion([]);

  expect((await sendMeetingReminder(env, today)).outcome).toBe("skipped");
});

test("a missing token is misconfigured, not ok", async () => {
  expect((await sendMeetingReminder({} as Env, today)).outcome).toBe(
    "misconfigured",
  );
});

test("a posted reminder is ok", async () => {
  mockNotion([meeting("Editorial Board Meeting", "2026-09-08")]);

  expect((await sendMeetingReminder(env, today)).outcome).toBe("ok");
});

test("a notion location cannot ping the board", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting", "2026-09-08", "@everyone room"),
  ]);

  await sendMeetingReminder(env, today);

  const body = JSON.stringify(discord.mock.calls[0]?.[0]);
  expect(body).toContain("room");
  expect(body).not.toContain("@everyone");
});

/*
  ADR 0010 gave Meetings a `Type`. these four pin the handover: the select wins
  wherever it is set, and the old title-prefix match survives only for rows
  nobody has typed yet — deleting it outright would have stopped the reminder
  finding anything, silently, on the first morning after deploy
*/
test("a meeting typed Editorial Board is found however it is titled", async () => {
  const discord = mockNotion([
    meeting(
      "Week 3 planning",
      "2026-09-08T19:00:00.000-04:00",
      "STAMP",
      "Editorial Board",
    ),
  ]);

  const result = await sendMeetingReminder(env, today);

  expect(result.outcome).toBe("ok");
  expect(discord).toHaveBeenCalled();
});

test("a typed General Body meeting is not the board's, whatever its title says", async () => {
  const discord = mockNotion([
    meeting(
      "Editorial Board social",
      "2026-09-08T19:00:00.000-04:00",
      "STAMP",
      "General Body",
    ),
  ]);

  const result = await sendMeetingReminder(env, today);

  expect(result.outcome).toBe("skipped");
  expect(discord).not.toHaveBeenCalled();
});

test("an untyped row still falls back to its title, so nothing broke on deploy", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting", "2026-09-08T19:00:00.000-04:00"),
  ]);

  const result = await sendMeetingReminder(env, today);

  expect(result.outcome).toBe("ok");
  expect(discord).toHaveBeenCalled();
});

test("an untyped row with an unrelated title is still not a board meeting", async () => {
  const discord = mockNotion([
    meeting("Magazine design session", "2026-09-08T19:00:00.000-04:00"),
  ]);

  const result = await sendMeetingReminder(env, today);

  expect(result.outcome).toBe("skipped");
  expect(discord).not.toHaveBeenCalled();
});

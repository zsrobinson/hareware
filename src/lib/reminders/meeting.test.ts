import { afterEach, expect, test, vi } from "vitest";
import { sendMeetingReminder } from "./meeting";

const env = {
  NOTION_TOKEN: "secret",
  DISCORD_BOARD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
} as unknown as Env;

const today = { date: "2026-09-08", hour: 8, weekday: "Tuesday" };

const meeting = (title: string, start: string, location = "McKeldin 2100E") => ({
  url: `https://notion.so/${encodeURIComponent(title)}`,
  properties: {
    Name: { type: "title", title: [{ plain_text: title }] },
    Date: { type: "date", date: { start } },
    Location: { type: "rich_text", rich_text: [{ plain_text: location }] },
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

  expect(result).toContain("posted meeting reminder");
  expect(discord).toHaveBeenCalledOnce();
  expect(discord.mock.calls[0]![0].components[0].content).toContain(
    "**Meeting Tonight**",
  );
});

test("ignores a general body meeting on the same day", async () => {
  const discord = mockNotion([
    meeting("General Body Meeting 2026-09-08", "2026-09-08"),
  ]);

  expect(await sendMeetingReminder(env, today)).toContain("no Editorial Board");
  expect(discord).not.toHaveBeenCalled();
});

test("ignores a magazine design session", async () => {
  const discord = mockNotion([meeting("Magazine Design Session", "2026-09-08")]);

  expect(await sendMeetingReminder(env, today)).toContain("no Editorial Board");
  expect(discord).not.toHaveBeenCalled();
});

test("tolerates the trailing spaces real titles carry", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting 2026-09-08 ", "2026-09-08"),
  ]);

  expect(await sendMeetingReminder(env, today)).toContain("posted");
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

  expect(await sendMeetingReminder(env, today)).toContain("posted");
  expect(discord.mock.calls[0]![0].components[0].content).toContain("at 8pm");
});

test("ignores a meeting that belongs to another day", async () => {
  const discord = mockNotion([
    meeting("Editorial Board Meeting", "2026-09-09T20:00:00.000-04:00"),
  ]);

  expect(await sendMeetingReminder(env, today)).toContain("no Editorial Board");
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

test("says what is unset rather than throwing", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const result = await sendMeetingReminder({} as Env, today);

  expect(result).toContain("NOTION_TOKEN");
  expect(fetchMock).not.toHaveBeenCalled();
});

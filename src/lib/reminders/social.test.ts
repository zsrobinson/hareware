import { afterEach, expect, test, vi } from "vitest";
import { sendSocialPing } from "./social";
import { SOCIAL_ROLE_IDS } from "./config";
import { postedId } from "~/lib/discord/interactions";

const env = {
  DISCORD_SOCIAL_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
} as unknown as Env;

/** 2026-09-03 was a thursday; 12:00 utc is 8am eastern */
const today = { date: "2026-09-03", hour: 8, weekday: "Thursday" };

const item = (title: string, pubDate: string, slug: string) => `
  <item>
    <title>${title}</title>
    <link>https://theumdhare.com/2026/09/03/${slug}/</link>
    <pubDate>${pubDate}</pubDate>
  </item>`;

function mockFeed(items: string) {
  const discord = vi.fn();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("discord.com")) {
        discord(JSON.parse(init!.body as string));
        return new Response(JSON.stringify({ components: Array(40).fill({}) }));
      }
      return new Response(
        `<?xml version="1.0"?><rss><channel>${items}</channel></rss>`,
      );
    }),
  );

  return discord;
}

afterEach(() => vi.unstubAllGlobals());

test("pings the day's role with what published today", async () => {
  const discord = mockFeed(
    item(
      "Looney's line wraps around Earth",
      "Wed, 03 Sep 2026 10:00:00 +0000",
      "looneys",
    ),
  );

  const result = await sendSocialPing(env, today);
  expect(result).toContain("posted 1 article");

  const body = discord.mock.calls[0]![0];
  expect(body.components[0].content).toContain(
    `<@&${SOCIAL_ROLE_IDS.Thursday}>`,
  );
  expect(body.components[0].content).toContain(
    "**Looney's line wraps around Earth**",
  );
  expect(body.allowed_mentions.roles).toEqual([SOCIAL_ROLE_IDS.Thursday]);
});

test("offers marking posted, and a link into the post generator", async () => {
  const discord = mockFeed(
    item("A headline", "Wed, 03 Sep 2026 10:00:00 +0000", "a-headline"),
  );

  await sendSocialPing(env, today);

  const [mark, open] = discord.mock.calls[0]![0].components[1].components;

  // interactive: only an application-owned webhook may send this
  expect(mark.label).toBe("Not posted");
  expect(mark.style).toBe(4);
  expect(mark.custom_id).toBe(postedId("a-headline"));
  expect(mark.url).toBeUndefined();

  expect(open.label).toBe("Open Post Generator");
  expect(open.url).toContain("/generate?article=a-headline");
});

test("each article gets its own button, so one press spends only one", async () => {
  const discord = mockFeed(
    item("One", "Wed, 03 Sep 2026 10:00:00 +0000", "one") +
      item("Two", "Wed, 03 Sep 2026 11:00:00 +0000", "two"),
  );

  await sendSocialPing(env, today);

  const components = discord.mock.calls[0]![0].components;
  expect(components[1].components[0].custom_id).toBe(postedId("one"));
  expect(components[4].components[0].custom_id).toBe(postedId("two"));
});

test("posts nothing on a day with no articles", async () => {
  const discord = mockFeed(
    item("Yesterday's piece", "Tue, 02 Sep 2026 10:00:00 +0000", "old"),
  );

  expect(await sendSocialPing(env, today)).toContain("no articles published");
  expect(discord).not.toHaveBeenCalled();
});

/*
  an article published at 6am eastern is 10:00 utc the same day, but one at 8pm
  eastern is already tomorrow in utc — comparing utc calendar days would file it
  under the wrong date and ping the wrong roster
*/
test("counts an evening article as today in eastern, not utc", async () => {
  const discord = mockFeed(
    item("Late piece", "Fri, 04 Sep 2026 00:30:00 +0000", "late"),
  );

  expect(await sendSocialPing(env, today)).toContain("posted 1 article");
  expect(discord).toHaveBeenCalledOnce();
});

test("separates multiple articles", async () => {
  const discord = mockFeed(
    item("One", "Wed, 03 Sep 2026 10:00:00 +0000", "one") +
      item("Two", "Wed, 03 Sep 2026 11:00:00 +0000", "two"),
  );

  await sendSocialPing(env, today);

  const kinds = discord.mock.calls[0]![0].components.map(
    (c: { type: number }) => c.type,
  );
  // text, buttons, separator, text, buttons
  expect(kinds).toEqual([10, 1, 14, 10, 1]);
});

test("says what is unset rather than throwing", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const result = await sendSocialPing({} as Env, today);

  expect(result).toContain("DISCORD_SOCIAL_WEBHOOK_URL");
  expect(fetchMock).not.toHaveBeenCalled();
});

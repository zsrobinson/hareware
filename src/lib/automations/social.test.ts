import { afterEach, expect, test, vi } from "vitest";
import { sendSocialPing, windowStart } from "./social";
import { SOCIAL_ROLE_IDS } from "./config";
import { postedId } from "~/lib/services/discord/posted-button";

const env = { DISCORD_BOT_TOKEN: "bot-token" } as unknown as Env;

/** 2026-09-03 was a thursday; 12:00 utc is 8am eastern */
const eightAm = new Date("2026-09-03T12:00:00Z");

/** a post as the REST API returns one: `date_gmt` carries no Z */
const post = (title: string, dateGmt: string, slug: string, id = 1) => ({
  id,
  date_gmt: dateGmt,
  link: `https://theumdhare.com/2026/09/03/${slug}/`,
  title: { rendered: title },
  categories: [103],
});

function mockWordPress(posts: unknown[] | string) {
  const discord = vi.fn();
  const wordpress = vi.fn();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("discord.com")) {
        discord(JSON.parse(init!.body as string));
        return new Response(JSON.stringify({ components: Array(40).fill({}) }));
      }
      wordpress(String(input));
      return new Response(
        typeof posts === "string" ? posts : JSON.stringify(posts),
      );
    }),
  );

  return { discord, wordpress };
}

afterEach(() => vi.unstubAllGlobals());

test("pings the day's role with what published since the last run", async () => {
  const { discord } = mockWordPress([
    post(
      "Looney&#8217;s line wraps around Earth",
      "2026-09-03T10:00:00",
      "looneys",
    ),
  ]);

  const result = await sendSocialPing(env, eightAm);
  expect(result.summary).toContain("posted 1 article");

  const body = discord.mock.calls[0]![0];
  expect(body.components[0].content).toContain(
    `<@&${SOCIAL_ROLE_IDS.Thursday}>`,
  );
  expect(body.components[0].content).toContain(
    "**Looney’s line wraps around Earth**",
  );
  expect(body.allowed_mentions.roles).toEqual([SOCIAL_ROLE_IDS.Thursday]);
});

test("the window opens at the previous 8am Eastern, through DST", () => {
  expect(windowStart(eightAm).toISOString()).toBe("2026-09-02T12:00:00.000Z");
  /* the morning after clocks go back: yesterday's 8am was still EDT */
  expect(windowStart(new Date("2026-11-02T13:00:00Z")).toISOString()).toBe(
    "2026-11-01T13:00:00.000Z",
  );
  expect(windowStart(new Date("2026-11-01T13:00:00Z")).toISOString()).toBe(
    "2026-10-31T12:00:00.000Z",
  );
  /* before 8am, the last run was yesterday's, so the window opens the day before */
  expect(windowStart(new Date("2026-09-03T11:00:00Z")).toISOString()).toBe(
    "2026-09-01T12:00:00.000Z",
  );
});

test("a post from after yesterday's 8am is announced; one from before is not", async () => {
  /* the API is asked for a day early, so it can hand back both */
  const { discord } = mockWordPress([
    post("Already announced", "2026-09-02T11:59:00", "old", 1),
    post("Went up at 9am yesterday", "2026-09-02T13:00:00", "nine", 2),
  ]);

  await sendSocialPing(env, eightAm);

  const body = JSON.stringify(discord.mock.calls[0]![0]);
  expect(body).toContain("Went up at 9am yesterday");
  expect(body).not.toContain("Already announced");
});

test("asks WordPress for posts after the window, early enough for its local dates", async () => {
  const { wordpress } = mockWordPress([]);

  await sendSocialPing(env, eightAm);

  const url = new URL(wordpress.mock.calls[0]![0]);
  expect(url.pathname).toBe("/wp-json/wp/v2/posts");
  expect(Date.parse(url.searchParams.get("after")!)).toBeLessThan(
    Date.parse("2026-09-02T12:00:00Z"),
  );
});

test("offers marking posted, and a link into the post generator", async () => {
  const { discord } = mockWordPress([
    post("A headline", "2026-09-03T10:00:00", "a-headline"),
  ]);

  await sendSocialPing(env, eightAm);

  const [mark, open] = discord.mock.calls[0]![0].components[1].components;
  expect(mark.label).toBe("Not posted");
  expect(mark.style).toBe(4);
  expect(mark.custom_id).toBe(postedId("a-headline"));
  expect(open.url).toContain("/generate?article=a-headline");
});

test("each article gets its own button, separated", async () => {
  const { discord } = mockWordPress([
    post("One", "2026-09-03T10:00:00", "one", 1),
    post("Two", "2026-09-03T11:00:00", "two", 2),
  ]);

  await sendSocialPing(env, eightAm);

  const components = discord.mock.calls[0]![0].components;
  expect(components.map((c: { type: number }) => c.type)).toEqual([
    10, 1, 14, 10, 1,
  ]);
  expect(components[1].components[0].custom_id).toBe(postedId("one"));
  expect(components[4].components[0].custom_id).toBe(postedId("two"));
});

test("a quiet day is skipped, not failed", async () => {
  const { discord } = mockWordPress([]);

  const result = await sendSocialPing(env, eightAm);

  expect(result.outcome).toBe("skipped");
  expect(discord).not.toHaveBeenCalled();
});

test("a throttled WordPress is a failure, not a quiet day", async () => {
  /* wordpress.com's throttle page can come back with a 200 */
  mockWordPress("<html>429 Too Many Requests</html>");

  const result = await sendSocialPing(env, eightAm);

  expect(result.outcome).toBe("failed");
  expect(result.summary).toContain("wordpress");
});

test("says what is unset rather than throwing", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const result = await sendSocialPing({} as Env, eightAm);

  expect(result.summary).toContain("DISCORD_BOT_TOKEN");
  expect(fetchMock).not.toHaveBeenCalled();
});

/* `inert()` has its own tests; this checks the ping calls it */
test("a headline cannot ping the server through the ping", async () => {
  const { discord } = mockWordPress([
    post("@everyone read this", "2026-09-03T10:00:00", "x"),
  ]);

  await sendSocialPing(env, eightAm);

  const body = JSON.stringify(discord.mock.calls[0]?.[0]);
  expect(body).toContain("everyone");
  expect(body).toContain(`<@&${SOCIAL_ROLE_IDS.Thursday}>`);
  expect(body).not.toContain("@everyone");
});

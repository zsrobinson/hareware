import { afterEach, expect, test, vi } from "vitest";
import { ARTICLES_DATA_SOURCE_ID } from "~/lib/articles/config";
import { MEETINGS_DATA_SOURCE_ID, MEMBERS_DATA_SOURCE_ID } from "./config";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { kioskData } = await import("./views");

afterEach(() => vi.unstubAllGlobals());

/** every notion url the read touched, in order */
function watchNotion(): string[] {
  const asked: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(String(url));

      return new Response(
        JSON.stringify({ results: [], has_more: false, properties: {} }),
      );
    }),
  );

  return asked;
}

/*
  the point of Members' `Contributions` formula.

  drawing the kiosk used to mean reading every article the club has ever
  published — two requests today, one more every few years — to render an
  all-time count beside a name. This goes red the day somebody reaches for the
  corpus again from here
*/
test("the attendance read never touches the article corpus", async () => {
  const asked = watchNotion();

  await kioskData({ NOTION_TOKEN: "secret" }, "2026-09-07", null);

  expect(asked.some((url) => url.includes(ARTICLES_DATA_SOURCE_ID))).toBe(
    false,
  );
  expect(asked.some((url) => url.includes(MEMBERS_DATA_SOURCE_ID))).toBe(true);
  expect(asked.some((url) => url.includes(MEETINGS_DATA_SOURCE_ID))).toBe(true);
  /* the roster, the calendar and the Status schema, and nothing else */
  expect(asked).toHaveLength(3);
});

test("a candidate carries the count notion computed for their row", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = String(url).includes(MEMBERS_DATA_SOURCE_ID)
        ? {
            results: [
              {
                id: "p1",
                properties: {
                  Name: { type: "title", title: [{ plain_text: "Ada" }] },
                  Contributions: {
                    type: "formula",
                    formula: { type: "number", number: 4 },
                  },
                },
              },
            ],
            has_more: false,
          }
        : { results: [], has_more: false, properties: {} };

      return new Response(JSON.stringify(body));
    }),
  );

  const data = await kioskData({ NOTION_TOKEN: "secret" }, "2026-09-07", null);

  expect(data.candidates.map((person) => person.contributions)).toEqual([4]);
});

/*
  the roster travels to the page because the google group comparison happens in
  the browser: an editor exports the group's members and the file is diffed
  against these rows without going anywhere. A page missing the roster would
  compare against nothing and report that everybody is already a member
*/
test("the reconciler carries the roster the group is compared against", async () => {
  const { reconcilerData } = await import("./views");

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("discord.com")) {
        return new Response(JSON.stringify({ guild_join_requests: [] }));
      }

      return new Response(
        JSON.stringify({
          results: [
            {
              id: "p1",
              properties: {
                Name: { type: "title", title: [{ plain_text: "Ada Vance" }] },
                Email: { type: "email", email: "ada@terpmail.umd.edu" },
              },
            },
          ],
          has_more: false,
          properties: {},
        }),
      );
    }),
  );

  const data = await reconcilerData({
    NOTION_TOKEN: "secret",
    DISCORD_BOT_TOKEN: "bot",
  } as never);

  expect(data.roster.map((one) => one.name)).toEqual(["Ada Vance"]);
  expect(data.discordSuggestions).toEqual([]);
  expect(data.discordProblem).toMatch(/guild member response was not a list/);
});

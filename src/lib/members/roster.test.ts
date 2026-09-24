import { afterEach, expect, test, vi } from "vitest";
import { ARTICLES_DATA_SOURCE_ID } from "~/lib/articles/config";
import { corpus, meetings, statusOptions, toPerson } from "./roster";

afterEach(() => vi.unstubAllGlobals());

const title = (text: string) => ({
  type: "title",
  title: [{ plain_text: text }],
});
const richText = (text: string) => ({
  type: "rich_text",
  rich_text: [{ plain_text: text }],
});

/** one Meetings row, read through `meetings` */
async function toMeeting(row: { id: string; properties: object }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ results: [row], has_more: false })),
  );
  return (await meetings("token"))[0]!;
}

/** one Articles row, read through `corpus` */
async function toContribution(row: { id: string; properties: object }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json({
        results: String(url).includes(ARTICLES_DATA_SOURCE_ID) ? [row] : [],
        has_more: false,
      }),
    ),
  );
  return (await corpus("token")).contributions[0]!;
}

test("a Members row reads into a Person", () => {
  const person = toPerson({
    id: "p1",
    properties: {
      Name: title("Bay Hoffman"),
      "Discord ID": richText("574376763006648349"),
      Email: { type: "email", email: "bay@terpmail.umd.edu" },
      Status: { type: "select", select: { name: "Undergrad" } },
    },
  });

  expect(person).toEqual({
    pageId: "p1",
    name: "Bay Hoffman",
    discordId: "574376763006648349",
    email: "bay@terpmail.umd.edu",
    status: "Undergrad",
    contributions: 0,
  });
});

test("an empty Discord ID reads as null, never as an empty string", () => {
  const person = toPerson({
    id: "p1",
    properties: { Name: title("Bay Hoffman"), "Discord ID": richText("   ") },
  });

  expect(person.discordId).toBeNull();
});

test("the Contributions formula reads as its number", () => {
  const person = toPerson({
    id: "p1",
    properties: {
      Name: title("Ada"),
      Contributions: {
        type: "formula",
        formula: { type: "number", number: 3 },
      },
    },
  });

  expect(person.contributions).toBe(3);
});

/* an unreadable property is omitted, and must not become NaN */
test("a missing Contributions property counts as none rather than NaN", () => {
  const person = toPerson({ id: "p1", properties: { Name: title("Ada") } });

  expect(person.contributions).toBe(0);
});

test("a Contributions formula that is not a number counts as none", () => {
  const empty = toPerson({
    id: "p1",
    properties: {
      Name: title("Ada"),
      Contributions: {
        type: "formula",
        formula: { type: "number", number: null },
      },
    },
  });
  const wrongType = toPerson({
    id: "p2",
    properties: {
      Name: title("Bay"),
      Contributions: { type: "formula", formula: { type: "string" } },
    },
  });

  expect(empty.contributions).toBe(0);
  expect(wrongType.contributions).toBe(0);
});

test("a missing email and a missing status are null rather than absent", () => {
  const person = toPerson({ id: "p1", properties: { Name: title("Ada") } });

  expect(person.email).toBeNull();
  expect(person.status).toBeNull();
});

/* an option this repository has never seen is a label, not an error */
test("a Status notion has and we do not is kept, not coerced to unknown", () => {
  const person = toPerson({
    id: "p1",
    properties: {
      Name: title("Ada"),
      Status: { type: "select", select: { name: "Faculty" } },
    },
  });

  expect(person.status).toBe("Faculty");
});

test("a Meetings row reads its type and its attendees", async () => {
  const meeting = await toMeeting({
    id: "m1",
    properties: {
      Name: title("General Body Meeting"),
      Date: { type: "date", date: { start: "2026-09-08" } },
      Type: { type: "select", select: { name: "General Body" } },
      Attendees: { type: "relation", relation: [{ id: "p1" }, { id: "p2" }] },
    },
  });

  expect(meeting.type).toBe("General Body");
  expect(meeting.attendeeIds).toEqual(["p1", "p2"]);
});

test("a meeting with no date reads as empty, so no window can contain it", async () => {
  const meeting = await toMeeting({
    id: "m1",
    properties: {
      Name: title("TBD"),
      Attendees: { type: "relation", relation: [] },
    },
  });

  expect(meeting.date).toBe("");
  expect(meeting.attendeeIds).toEqual([]);
});

/* 9pm Eastern on the 9th is 1am UTC on the 10th */
test("a meeting with a time falls on its Eastern day", async () => {
  const meeting = await toMeeting({
    id: "m1",
    properties: {
      Name: title("General Body Meeting"),
      Date: { type: "date", date: { start: "2026-09-10T01:00:00.000Z" } },
      Attendees: { type: "relation", relation: [] },
    },
  });

  expect(meeting.date).toBe("2026-09-09");
});

test("an unreadable attendee relation refuses to compute standing", async () => {
  await expect(
    toMeeting({ id: "m1", properties: { Name: title("Meeting") } }),
  ).rejects.toThrow(/Attendees relation is not readable/);
});

test("an Article reads its two credits separately", async () => {
  const article = await toContribution({
    id: "a1",
    properties: {
      Headline: title("Something happened"),
      "Publication Date": { type: "date", date: { start: "2026-03-04" } },
      Author: { type: "relation", relation: [{ id: "p1" }] },
      "Image Crew": { type: "relation", relation: [{ id: "p2" }] },
    },
  });

  expect(article.authorIds).toEqual(["p1"]);
  expect(article.imageCrewIds).toEqual(["p2"]);
  expect(article.date).toBe("2026-03-04");
});

test("an article published at night falls on its Eastern day", async () => {
  const article = await toContribution({
    id: "a1",
    properties: {
      Headline: title("Something happened"),
      "Publication Date": {
        type: "date",
        date: { start: "2026-04-01T02:30:00.000Z" },
      },
      Author: { type: "relation", relation: [] },
      "Image Crew": { type: "relation", relation: [] },
    },
  });

  expect(article.date).toBe("2026-03-31");
});

test("a schema with no Status select is refused, not read as no options", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ properties: {} }))),
  );

  await expect(statusOptions("secret")).rejects.toThrow(/no readable Status/);
});

test("an unreadable credit relation refuses to compute standing", async () => {
  await expect(
    toContribution({
      id: "a1",
      properties: {
        Headline: title("Something happened"),
        "Publication Date": { type: "date", date: { start: "2026-03-04" } },
        Author: { type: "relation", relation: [] },
      },
    }),
  ).rejects.toThrow(/Image Crew relation is not readable/);
});

/* goes red if `corpus` becomes a `Promise.all` */
test("corpus never has more than two notion requests in flight", async () => {
  let running = 0;
  let most = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((done) => setTimeout(done, 5));
      running--;

      return new Response(JSON.stringify({ results: [], has_more: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );

  await corpus("secret");

  expect(most).toBeLessThanOrEqual(2);
  expect(most).toBeGreaterThan(1);
});

/* a general body meeting is more than the 25 a query shows */
test("a truncated attendee relation is read in full, not counted short", async () => {
  const asked: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(String(url));

      if (String(url).includes("/query")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "m1",
                properties: {
                  Name: title("General Body"),
                  /* notion sends the property id already percent-encoded */
                  Attendees: {
                    type: "relation",
                    id: "c%3CLo",
                    relation: [{ id: "p1" }],
                    has_more: true,
                  },
                },
              },
            ],
            has_more: false,
          }),
        );
      }

      if (String(url).includes("start_cursor=")) {
        return new Response(
          JSON.stringify({
            results: [{ relation: { id: "p3" } }],
            has_more: false,
          }),
        );
      }

      return new Response(
        JSON.stringify({
          results: [{ relation: { id: "p1" } }, { relation: { id: "p2" } }],
          has_more: true,
          next_cursor: "more",
        }),
      );
    }),
  );

  const [meeting] = await meetings("token");

  expect(meeting!.attendeeIds).toEqual(["p1", "p2", "p3"]);
  /* verbatim: encoded again, notion answers 200 with an empty list */
  expect(asked[1]).toContain("/pages/m1/properties/c%3CLo");
  expect(asked[1]).not.toContain("c%253CLo");
});

/* the extra read happens only for a relation notion cut short */
test("a relation notion answered in full costs no second read", async () => {
  const fetched = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "m1",
              properties: {
                Name: title("General Body"),
                Attendees: {
                  type: "relation",
                  id: "abc",
                  relation: [{ id: "p1" }],
                },
              },
            },
          ],
          has_more: false,
        }),
      ),
  );
  vi.stubGlobal("fetch", fetched);

  const [meeting] = await meetings("token");

  expect(meeting!.attendeeIds).toEqual(["p1"]);
  expect(fetched).toHaveBeenCalledTimes(1);
});

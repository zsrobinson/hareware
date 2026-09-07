import { afterEach, expect, test, vi } from "vitest";
import { toContribution, toMeeting, toPerson, people } from "./roster";

afterEach(() => vi.unstubAllGlobals());

const title = (text: string) => ({
  type: "title",
  title: [{ plain_text: text }],
});
const richText = (text: string) => ({
  type: "rich_text",
  rich_text: [{ plain_text: text }],
});

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

/* the difference between "no id" and "empty id" is the difference between a row
   we may link and a row we may not */
test("an empty Discord ID reads as null, never as an empty string", () => {
  const person = toPerson({
    id: "p1",
    properties: { Name: title("Bay Hoffman"), "Discord ID": richText("   ") },
  });

  expect(person.discordId).toBeNull();
});

/*
  the all-time count notion computes as `prop("Articles Count") +
  prop("Images Count")`, so a screen that only wants the total does not read
  every article the club has published to work it out
*/
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

/* a property the integration cannot read is omitted from the payload entirely,
   and a badge reading "NaN contributions" is the loud end of a quiet problem */
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

/* the options belong to notion and the pickers read them from the schema, so
   an option this repository has never seen is a label and not an error. only
   an empty select is "we do not know", which is what the reconciler chases */
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

test("a Meetings row reads its type and its attendees", () => {
  const meeting = toMeeting({
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

test("a meeting with no date reads as empty, so no window can contain it", () => {
  const meeting = toMeeting({ id: "m1", properties: { Name: title("TBD") } });

  expect(meeting.date).toBe("");
  expect(meeting.attendeeIds).toEqual([]);
});

test("an Article reads its two credits separately", () => {
  const article = toContribution({
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

/*
  the paging test. a reader that stops at the first page returns a plausible
  answer quietly missing everybody after the hundredth, which for an election is
  the worst shape a bug can take here
*/
test("every page is followed, not just the first", async () => {
  const page = (n: number) => ({
    id: `p${n}`,
    properties: { Name: title(`Member ${n}`) },
  });

  const bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as {
        start_cursor?: string;
      };
      bodies.push(body);

      if (!body.start_cursor) {
        return new Response(
          JSON.stringify({
            results: [page(1), page(2)],
            has_more: true,
            next_cursor: "second",
          }),
        );
      }

      return new Response(
        JSON.stringify({ results: [page(3)], has_more: false }),
      );
    }),
  );

  const roster = await people("token");

  expect(roster.map((one) => one.pageId)).toEqual(["p1", "p2", "p3"]);
  expect(bodies).toHaveLength(2);
});

test("a cursor that says has_more but sends none stops rather than looping", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ results: [], has_more: true, next_cursor: null }),
        ),
    ),
  );

  await expect(people("token")).resolves.toEqual([]);
});

/*
  the cap where it is actually needed.

  `together` has its own test, and a helper can be perfectly tested while
  nothing calls it: this is the one that goes red if `corpus` is written back
  as a `Promise.all`. `/standing` reads all three databases on every visit, and
  four notion requests in one tick is over the budget before any has answered.
*/
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

  const { corpus } = await import("./roster");
  await corpus("secret");

  expect(most).toBeLessThanOrEqual(2);
  expect(most).toBeGreaterThan(1);
});

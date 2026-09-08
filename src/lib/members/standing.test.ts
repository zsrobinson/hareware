import { expect, test } from "vitest";
import { PRESETS, standings, type Criteria } from "./standing";
import type { ContributionRecord, MeetingRecord, Person } from "./records";

const YEAR: Pick<Criteria, "from" | "to"> = {
  from: "2026-01-01",
  to: "2026-12-31",
};

const voting = PRESETS.find((p) => p.id === "voting")!;
const masthead = PRESETS.find((p) => p.id === "masthead")!;

const VOTING: Criteria = {
  ...YEAR,
  thresholds: voting.thresholds,
  combine: voting.combine,
  currentStudentsOnly: true,
};

function person(over: Partial<Person> = {}): Person {
  return {
    pageId: "p1",
    name: "Bay Hoffman",
    discordId: null,
    email: null,
    status: "Undergrad",
    contributions: 0,
  noAnnouncements: false,
    ...over,
  };
}

function meeting(over: Partial<MeetingRecord> = {}): MeetingRecord {
  return {
    pageId: `m${Math.random()}`,
    name: "General Body Meeting",
    date: "2026-03-04",
    type: "General Body",
    attendeeIds: ["p1"],
    ...over,
  };
}

function article(over: Partial<ContributionRecord> = {}): ContributionRecord {
  return {
    pageId: `a${Math.random()}`,
    headline: "Something happened",
    date: "2026-03-04",
    authorIds: ["p1"],
    imageCrewIds: [],
    ...over,
  };
}

/** the standing of the only person in a run */
function only(
  meetings: MeetingRecord[] = [],
  contributions: ContributionRecord[] = [],
  criteria: Criteria = VOTING,
  who: Person = person(),
) {
  const [standing] = standings([who], meetings, contributions, criteria);
  return standing!;
}

test("three general body meetings qualifies, two does not", () => {
  expect(only([meeting(), meeting(), meeting()]).qualifies).toBe(true);
  expect(only([meeting(), meeting()]).qualifies).toBe(false);
});

test("editorial board meetings count toward nothing", () => {
  const board = [
    meeting({ type: "Editorial Board" }),
    meeting({ type: "Editorial Board" }),
    meeting({ type: "Editorial Board" }),
  ];

  const standing = only(board);
  expect(standing.meetings).toBe(0);
  expect(standing.qualifies).toBe(false);
});

test("one volunteer event is enough on its own", () => {
  const standing = only([meeting({ type: "Volunteer Event" })]);
  expect(standing.volunteer).toBe(1);
  expect(standing.qualifies).toBe(true);
});

test("a volunteer event is not also a general body meeting", () => {
  const standing = only([meeting({ type: "Volunteer Event" })]);
  expect(standing.meetings).toBe(0);
});

test("two contributions qualify, and an image counts the same as an article", () => {
  const standing = only(
    [],
    [article(), article({ authorIds: [], imageCrewIds: ["p1"] })],
  );

  expect(standing.articles).toBe(1);
  expect(standing.images).toBe(1);
  expect(standing.contributions).toBe(2);
  expect(standing.qualifies).toBe(true);
});

test("writing and shooting one article counts as two contributions", () => {
  const standing = only(
    [],
    [article({ authorIds: ["p1"], imageCrewIds: ["p1"] })],
  );
  expect(standing.contributions).toBe(2);
});

test("an article outside the window counts for nothing", () => {
  const standing = only([], [article({ date: "2025-12-31" }), article()]);
  expect(standing.contributions).toBe(1);
});

test("the window is inclusive of both ends", () => {
  const standing = only(
    [],
    [article({ date: "2026-01-01" }), article({ date: "2026-12-31" })],
  );
  expect(standing.contributions).toBe(2);
});

test("a full timestamp compares as its day", () => {
  const standing = only([], [article({ date: "2026-12-31T18:41:17.187Z" })]);
  expect(standing.contributions).toBe(1);
});

test("an article with no publication date counts for nothing", () => {
  const standing = only([], [article({ date: "" })]);
  expect(standing.contributions).toBe(0);
});

test("a meeting with no type counts toward nothing", () => {
  expect(only([meeting({ type: null })]).meetings).toBe(0);
});

test("somebody listed twice on one meeting attended it once", () => {
  const standing = only([meeting({ attendeeIds: ["p1", "p1"] })]);
  expect(standing.meetings).toBe(1);
});

test("an alum is excluded from voting however much they did", () => {
  const alum = person({ status: "Alum" });
  const standing = only([meeting(), meeting(), meeting()], [], VOTING, alum);

  expect(standing.meetings).toBe(3);
  expect(standing.excludedAsAlum).toBe(true);
  expect(standing.qualifies).toBe(false);
});

test("an alum is on the masthead, because that question is not about standing", () => {
  const standing = only(
    [],
    [article()],
    {
      ...YEAR,
      thresholds: masthead.thresholds,
      combine: masthead.combine,
      currentStudentsOnly: false,
    },
    person({ status: "Alum" }),
  );

  expect(standing.qualifies).toBe(true);
  expect(standing.excludedAsAlum).toBe(false);
});

/* the 49 rows predating ADR 0010 all look like this, and a rule that denied
   them would disenfranchise the club at the first election it ran */
test("an unset status is flagged rather than treated as alum", () => {
  const standing = only(
    [meeting(), meeting(), meeting()],
    [],
    VOTING,
    person({ status: null }),
  );

  expect(standing.statusUnknown).toBe(true);
  expect(standing.excludedAsAlum).toBe(false);
  expect(standing.qualifies).toBe(true);
});

test("the clauses are an OR, and the reasons name the ones that were met", () => {
  const standing = only([meeting({ type: "Volunteer Event" })], [article()]);

  expect(standing.qualifies).toBe(true);
  expect(standing.reasons).toEqual(["1 volunteer event"]);
});

test("reasons are counted in the plural except at one", () => {
  const standing = only([meeting(), meeting(), meeting()]);
  expect(standing.reasons).toEqual(["3 general body meetings"]);
});

test("an omitted clause is never met, however large the count", () => {
  const standing = only([meeting(), meeting(), meeting()], [], {
    ...YEAR,
    thresholds: { contributions: 2 },
    combine: "or",
    currentStudentsOnly: true,
  });

  expect(standing.meetings).toBe(3);
  expect(standing.qualifies).toBe(false);
});

test("thresholds with no clauses at all qualify nobody", () => {
  const standing = only([meeting(), meeting(), meeting()], [article()], {
    ...YEAR,
    thresholds: {},
    combine: "or",
    currentStudentsOnly: false,
  });

  expect(standing.qualifies).toBe(false);
  expect(standing.reasons).toEqual([]);
});

test("everybody is returned, qualifying first and then by name", () => {
  const ada = person({ pageId: "p1", name: "Ada Vance" });
  const bay = person({ pageId: "p2", name: "Bay Hoffman" });
  const cyd = person({ pageId: "p3", name: "Cyd Alonso" });

  const result = standings(
    [bay, cyd, ada],
    [meeting({ attendeeIds: ["p3"], type: "Volunteer Event" })],
    [],
    VOTING,
  );

  expect(result.map((s) => s.person.name)).toEqual([
    "Cyd Alonso",
    "Ada Vance",
    "Bay Hoffman",
  ]);
});

test("attendance at somebody else's meeting is not yours", () => {
  const standing = only([meeting({ attendeeIds: ["p2"] })]);
  expect(standing.meetings).toBe(0);
});

test("both presets combine their clauses with OR", () => {
  expect(PRESETS.map((p) => p.combine)).toEqual(["or", "or"]);
});

const ALL: Criteria = { ...VOTING, combine: "and" };

test("under AND, meeting one clause of three is not enough", () => {
  const standing = only([meeting(), meeting(), meeting()], [], ALL);

  expect(standing.met.meetings).toBe(true);
  expect(standing.qualifies).toBe(false);
});

test("under AND, every clause that is set has to pass", () => {
  const standing = only(
    [meeting(), meeting(), meeting(), meeting({ type: "Volunteer Event" })],
    [article(), article()],
    ALL,
  );

  expect(standing.qualifies).toBe(true);
});

test("under AND, a clause nobody asked about is not part of the question", () => {
  const standing = only([], [article()], {
    ...YEAR,
    thresholds: { contributions: 1 },
    combine: "and",
    currentStudentsOnly: false,
  });

  expect(standing.meetings).toBe(0);
  expect(standing.qualifies).toBe(true);
});

test("no clauses at all qualify nobody under AND either", () => {
  const standing = only([meeting(), meeting(), meeting()], [article()], {
    ...YEAR,
    thresholds: {},
    combine: "and",
    currentStudentsOnly: false,
  });

  expect(standing.qualifies).toBe(false);
});

test("an alum is still excluded when the clauses combine with AND", () => {
  const standing = only(
    [meeting(), meeting(), meeting(), meeting({ type: "Volunteer Event" })],
    [article(), article()],
    ALL,
    person({ status: "Alum" }),
  );

  expect(standing.excludedAsAlum).toBe(true);
  expect(standing.qualifies).toBe(false);
});

test("met names the clauses that passed, including under AND", () => {
  const standing = only([meeting({ type: "Volunteer Event" })], [], ALL);

  expect(standing.met).toEqual({
    meetings: false,
    contributions: false,
    volunteer: true,
  });
});

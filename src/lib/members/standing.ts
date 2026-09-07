/*
  who satisfies a set of thresholds over a window of time.

  this is the whole point of ADR 0010, and it is a pure function over rows so
  that the club's constitution can be tested against fixtures rather than
  against notion. nothing here fetches anything.

  the constitution makes a member eligible to vote if, within the past year,
  they attended 3 meetings OR made 2 contributions OR volunteered once. the
  masthead is the same question with different numbers. so there is one
  function, and "voting" and "masthead" are argument sets — see `PRESETS`.
*/

import { plural } from "~/lib/utils";
import type { MeetingType } from "./config";
import type { ContributionRecord, MeetingRecord, Person } from "./records";

/**
 * the thresholds, as three independent clauses.
 *
 * each is the *minimum* that satisfies its clause. an omitted clause is not
 * part of the question — the masthead asks about contributions and says
 * nothing about attendance, and a `0` there would mean "everybody qualifies",
 * which is a different and much worse answer than "this clause does not apply".
 *
 * all three omitted means nothing can qualify. that is deliberate: it is a
 * question with no criteria, and answering it with the whole roster would be
 * a confident wrong answer to a query somebody mis-typed.
 */
export type Thresholds = {
  /** general body meetings attended */
  meetings?: number;
  /** articles written plus images credited */
  contributions?: number;
  /** volunteer events attended */
  volunteer?: number;
};

export type Combine = "and" | "or";

/** the question, in full */
export type Criteria = {
  /** inclusive `YYYY-MM-DD` bounds */
  from: string;
  to: string;
  thresholds: Thresholds;
  /**
   * how the clauses that are set combine.
   *
   * `"or"` is the constitution's rule and the default every preset uses. an
   * omitted clause is not part of the question in either mode, so `"and"`
   * requires every clause that is set and ignores the ones that are not
   */
  combine: Combine;
  /**
   * whether an `Alum` is excluded regardless of what they did.
   *
   * true for voting, because the constitution restricts it to current members.
   * false for the masthead, because an alum who wrote something this year is
   * printed beside everyone else who did
   */
  currentStudentsOnly: boolean;
};

/** the clauses of a `Thresholds`, and whether each was satisfied */
export type Met = Record<keyof Thresholds, boolean>;

/** what one person did in the window, and whether it was enough */
export type Standing = {
  person: Person;
  meetings: number;
  volunteer: number;
  articles: number;
  images: number;
  /** articles + images, which is what the contribution clause tests */
  contributions: number;
  qualifies: boolean;
  /** which clauses they met, so the page can point at the counts that answer */
  met: Met;
  /** the clauses they met, in the words the page prints */
  reasons: string[];
  /** excluded by `currentStudentsOnly` despite meeting a clause */
  excludedAsAlum: boolean;
  /**
   * their Status select is empty or unrecognised.
   *
   * such a person is **not** excluded, and is flagged instead. every one of the
   * 49 rows that predate ADR 0010 is in this state, and a rule that silently
   * denied them would disenfranchise the entire club at the first election.
   * erring toward visibility is the same instinct as refusing an ambiguous
   * member match rather than guessing at it
   */
  statusUnknown: boolean;
};

/*
  the two types that count, named from `MEETING_TYPES` rather than spelled
  again. `config.ts` claims to be the one place notion's select options are
  written down, and a second spelling here would make `tally` return zero
  counts — silently, and only for whichever type somebody re-worded
*/
const GENERAL_BODY: MeetingType = "General Body";
const VOLUNTEER: MeetingType = "Volunteer Event";

/**
 * a notion date reduced to its day.
 *
 * notion returns `2026-09-07` for a date-only property and a full ISO
 * timestamp when someone sets a time, and the two have to compare the same way
 */
function day(date: string): string {
  return date.slice(0, 10);
}

/** inclusive on both ends — ISO days compare correctly as strings */
function within(date: string, from: string, to: string): boolean {
  const at = day(date);
  return at >= from && at <= to;
}

/**
 * everyone's standing, whether or not they qualify.
 *
 * the whole roster rather than only the qualifying rows, because the page has
 * to be able to show somebody why they fell short — "2 meetings" is the answer
 * to the question people actually ask, and a filtered list cannot give it.
 *
 * sorted by qualifying first, then by name, so the answer to the question is
 * at the top and the near-misses are findable underneath
 */
export function standings(
  people: Person[],
  meetings: MeetingRecord[],
  contributions: ContributionRecord[],
  criteria: Criteria,
): Standing[] {
  const { from, to } = criteria;

  const inWindow = meetings.filter((m) => m.date && within(m.date, from, to));
  const published = contributions.filter(
    (c) => c.date && within(c.date, from, to),
  );

  /*
    counted into maps in one pass each rather than filtered per person: the
    roster is small today, but this is O(people × events) the naive way and the
    attendance relation grows by a whole meeting's worth of rows every week
  */
  const attended = tally(inWindow, GENERAL_BODY);
  const volunteered = tally(inWindow, VOLUNTEER);

  const wrote = new Map<string, number>();
  const shot = new Map<string, number>();
  for (const article of published) {
    for (const id of article.authorIds) bump(wrote, id);
    for (const id of article.imageCrewIds) bump(shot, id);
  }

  return people
    .map((person) =>
      score(person, criteria, {
        meetings: attended.get(person.pageId) ?? 0,
        volunteer: volunteered.get(person.pageId) ?? 0,
        articles: wrote.get(person.pageId) ?? 0,
        images: shot.get(person.pageId) ?? 0,
      }),
    )
    .sort(
      (a, b) =>
        Number(b.qualifies) - Number(a.qualifies) ||
        a.person.name.localeCompare(b.person.name),
    );
}

/** how many meetings of one type each member attended */
function tally(
  meetings: MeetingRecord[],
  type: MeetingType,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const meeting of meetings) {
    if (meeting.type !== type) continue;
    /*
      a member listed twice on one meeting is one attendance. notion permits a
      relation to hold the same page twice, and a double-tap on the kiosk is
      the likeliest way it happens
    */
    for (const id of new Set(meeting.attendeeIds)) bump(counts, id);
  }

  return counts;
}

function bump(counts: Map<string, number>, id: string) {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

type Counts = {
  meetings: number;
  volunteer: number;
  articles: number;
  images: number;
};

function score(person: Person, criteria: Criteria, counts: Counts): Standing {
  const { thresholds, combine, currentStudentsOnly } = criteria;

  /*
    an image credit counts the same as writing, per ADR 0010, so the clause
    tests the sum. they are reported separately as well because an editor
    looking at a masthead wants to know which of the two a person did — and
    somebody credited on both sides of one article legitimately counts twice
  */
  const contributions = counts.articles + counts.images;

  const met: Met = {
    meetings: satisfies(counts.meetings, thresholds.meetings),
    contributions: satisfies(contributions, thresholds.contributions),
    volunteer: satisfies(counts.volunteer, thresholds.volunteer),
  };

  const reasons: string[] = [];
  if (met.meetings)
    reasons.push(plural(counts.meetings, "general body meeting"));
  if (met.contributions) reasons.push(plural(contributions, "contribution"));
  if (met.volunteer) reasons.push(plural(counts.volunteer, "volunteer event"));

  /*
    under "and", a clause nobody set is still not part of the question, so the
    test is over the clauses present rather than over all three — otherwise the
    masthead, which sets one, could never be answered conjunctively at all
  */
  const asked = (["meetings", "contributions", "volunteer"] as const).filter(
    (clause) => thresholds[clause] !== undefined,
  );
  const enough =
    combine === "and"
      ? asked.length > 0 && asked.every((clause) => met[clause])
      : reasons.length > 0;

  const excludedAsAlum = currentStudentsOnly && person.status === "Alum";

  return {
    person,
    ...counts,
    contributions,
    qualifies: enough && !excludedAsAlum,
    met,
    reasons,
    excludedAsAlum,
    statusUnknown: person.status === null,
  };
}

/** an omitted threshold is not a clause, so it is never met */
function satisfies(count: number, threshold: number | undefined): boolean {
  return threshold !== undefined && count >= threshold;
}

/** a saved question, as the page offers it */
export type Preset = {
  id: string;
  name: string;
  thresholds: Thresholds;
  combine: Combine;
  currentStudentsOnly: boolean;
  /** how far back the window reaches by default */
  months: number;
};

/**
 * the two questions the club actually asks.
 *
 * written down here so the constitution's rule lives in one place instead of
 * being recalled each spring — but they are defaults on a form, not constants
 * the code enforces. the thresholds belong to whoever owns the rule, and an
 * editor changing them must not need a deployment
 */
export const PRESETS: Preset[] = [
  {
    id: "voting",
    name: "Voting eligibility",
    thresholds: { meetings: 3, contributions: 2, volunteer: 1 },
    combine: "or",
    currentStudentsOnly: true,
    months: 12,
  },
  {
    id: "masthead",
    name: "Masthead",
    thresholds: { contributions: 1 },
    combine: "or",
    currentStudentsOnly: false,
    months: 12,
  },
];

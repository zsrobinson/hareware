/*
  who meets a set of thresholds over a window: voting eligibility and the
  masthead are the same question with different numbers (`PRESETS`). Pure, so
  the constitution is tested against fixtures. ADR 0010.
*/

import { plural } from "~/lib/utils";
import { ALUM_STATUS, MEETING_TYPE, type MeetingType } from "./config";
import type { ContributionRecord, MeetingRecord, Person } from "./records";

/**
 * the minimum for each clause. An omitted clause is not part of the question,
 * which `0` would not express; with all three omitted nobody qualifies
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
  /** how the clauses that are set combine; the constitution's rule is `"or"` */
  combine: Combine;
  /** whether an `Alum` is excluded regardless of what they did: voting, not the masthead */
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
  /** which clauses they met */
  met: Met;
  /** the clauses they met, in the words the page prints */
  reasons: string[];
  /** excluded by `currentStudentsOnly` despite meeting a clause */
  excludedAsAlum: boolean;
  /** their Status is empty. Flagged, never excluded: most of the roster has none */
  statusUnknown: boolean;
};

/** inclusive on both ends — ISO days compare correctly as strings */
function within(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}

/** everyone's standing, qualifying first, so the page can show why somebody fell short */
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

  const attended = tally(inWindow, MEETING_TYPE.generalBody);
  const volunteered = tally(inWindow, MEETING_TYPE.volunteer);

  /* from the articles, never `person.contributions`: that formula is all-time
     and every clause here is over the window */
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

/** attendances of one meeting type, per member */
function tally(
  meetings: MeetingRecord[],
  type: MeetingType,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const meeting of meetings) {
    if (meeting.type !== type) continue;
    /* notion lets a relation hold the same page twice */
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

  /* an image credit counts the same as writing (ADR 0010); both credits on
     one article count twice */
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

  /* under "and", only the clauses that are set */
  const asked = (["meetings", "contributions", "volunteer"] as const).filter(
    (clause) => thresholds[clause] !== undefined,
  );
  const enough =
    combine === "and"
      ? asked.length > 0 && asked.every((clause) => met[clause])
      : reasons.length > 0;

  const excludedAsAlum = currentStudentsOnly && person.status === ALUM_STATUS;

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

/** the club's two questions, as defaults on the form rather than enforced rules */
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

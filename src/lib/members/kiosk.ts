/*
  the two decisions the kiosk makes before a human touches it: which meeting it
  is, and which of the fifty names in the roster to offer somebody halfway
  through typing theirs.

  both are pure and live here rather than in the island, because they are the
  parts that can be wrong. ADR 0010 puts this laptop at the front of a room
  with a queue of people in front of it, and the two failures it names are a
  typo creating a second copy of somebody and a tap landing on the wrong
  existing person. autocomplete fixes the first and causes the second, so the
  ranking below never collapses two people into one offer — it hands both to
  the room and makes them different enough to tell apart.
*/

import { normaliseName } from "~/lib/articles/member";
import type { ContributionRecord, MeetingRecord, Person } from "./standing";

/**
 * a person as the kiosk offers them.
 *
 * carries what distinguishes two people sharing a name, because that is the
 * one thing the picker must never guess at — see ADR 0010, which makes the
 * same refusal ADR 0009 already makes for a byline
 */
export type Candidate = {
  person: Person;
  /** how many articles and images they are credited on, all time */
  contributions: number;
};

/** all-time credits per member page id, for the disambiguation hint */
export function contributionCounts(
  contributions: ContributionRecord[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const article of contributions) {
    for (const id of [...article.authorIds, ...article.imageCrewIds]) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * the short line under a name that tells two people apart.
 *
 * an email domain rather than the whole address: the room can see this screen,
 * and `zach@terpmail.umd.edu` on a projector is more of somebody's address
 * than they agreed to when they signed in. the domain is enough to separate a
 * terpmail from a gmail, which is the split that actually occurs.
 *
 * a person with neither an email nor a credit gets "no email on file", which
 * is deliberately a slightly uncomfortable thing to read: it is the row most
 * likely to be a duplicate, and the reconciler is where it gets fixed
 */
export function distinguish(candidate: Candidate): string {
  const parts: string[] = [];

  const domain = candidate.person.email?.split("@")[1];
  parts.push(domain ? `@${domain}` : "no email on file");

  if (candidate.contributions > 0) {
    parts.push(
      `${candidate.contributions} contribution${candidate.contributions === 1 ? "" : "s"}`,
    );
  }

  if (candidate.person.status) parts.push(candidate.person.status);

  return parts.join(" · ");
}

/**
 * whether two offers would look identical on the kiosk.
 *
 * used by the island to decide when to *insist* on the second line rather than
 * merely show it. two rows with the same name and nothing to separate them are
 * not a pick a person can make correctly, and the kiosk says so instead of
 * letting somebody guess
 */
export function indistinguishable(a: Candidate, b: Candidate): boolean {
  return (
    normaliseName(a.person.name) === normaliseName(b.person.name) &&
    distinguish(a) === distinguish(b)
  );
}

/**
 * the roster narrowed to what somebody has typed so far.
 *
 * matched on a normalised form so accents, punctuation and case do not have to
 * be reproduced by a person standing up: `normaliseName` already folds all
 * three for byline matching, and the kiosk wants exactly the same tolerance.
 *
 * ranked prefix-first because people type their own name from the front, and
 * an infix hit ("ann" inside "Joanna") is a real match but a less likely one.
 * ties break on name so the order does not change under the fingers of
 * somebody who is mid-tap.
 *
 * an empty query returns nothing rather than everybody: the kiosk's first
 * screen is an invitation to type, and dumping fifty names into it makes the
 * wrong-person tap more likely, not less
 */
export function searchCandidates(
  candidates: Candidate[],
  query: string,
  limit = 8,
): Candidate[] {
  const needle = normaliseName(query);
  if (!needle) return [];

  return candidates
    .map((candidate) => ({
      candidate,
      at: normaliseName(candidate.person.name).indexOf(needle),
    }))
    .filter((scored) => scored.at >= 0)
    .sort(
      (a, b) =>
        a.at - b.at ||
        a.candidate.person.name.localeCompare(b.candidate.person.name),
    )
    .slice(0, limit)
    .map((scored) => scored.candidate);
}

/**
 * the meeting the kiosk opens on.
 *
 * today's if there is one, and otherwise the most recent one already past.
 * never a future meeting: the calendar holds the whole semester, and opening
 * on next week's general body would file tonight's attendance against it —
 * silently, and discovered only when somebody's eligibility is short.
 *
 * a past meeting is the safer default for the same reason it is the likelier
 * one: an officer who opens this at 7pm is either at tonight's meeting or
 * catching up on the last one.
 *
 * editorial board meetings are candidates here even though they count toward
 * nothing. attendance is a record of what happened, and the counting rule
 * lives in `standing.ts` — filtering them out here would mean the board could
 * not use the kiosk at all
 */
export function defaultMeeting(
  meetings: MeetingRecord[],
  today: string,
): MeetingRecord | null {
  const dated = meetings
    .filter((meeting) => meeting.date)
    .map((meeting) => ({ meeting, day: meeting.date.slice(0, 10) }))
    .filter((entry) => entry.day <= today)
    .sort((a, b) => b.day.localeCompare(a.day));

  return dated[0]?.meeting ?? null;
}

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

import type { Faces } from "~/lib/faces";
import { normaliseName } from "~/lib/articles/member";
import { plural } from "~/lib/utils";
import type { MeetingRecord, Person } from "./records";

/**
 * the short line under a name that tells two people apart.
 *
 * the whole address rather than its domain: two people with one name and one
 * domain are the pair this has to separate, and `@terpmail.umd.edu` twice
 * separates nothing.
 *
 * a person with neither an email nor a credit gets "no email on file", which
 * is deliberately a slightly uncomfortable thing to read: it is the row most
 * likely to be a duplicate
 */
export function distinguish(person: Person): string {
  const parts: string[] = [];

  parts.push(person.email ?? "no email on file");

  if (person.contributions > 0) {
    parts.push(plural(person.contributions, "contribution"));
  }

  if (person.status) parts.push(person.status);

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
export function indistinguishable(a: Person, b: Person): boolean {
  return (
    normaliseName(a.name) === normaliseName(b.name) &&
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
  roster: Person[],
  query: string,
  limit = 8,
): Person[] {
  const needle = normaliseName(query);
  if (!needle) return [];

  return roster
    .map((person) => ({
      person,
      at: normaliseName(person.name).indexOf(needle),
    }))
    .filter((scored) => scored.at >= 0)
    .sort((a, b) => a.at - b.at || a.person.name.localeCompare(b.person.name))
    .slice(0, limit)
    .map((scored) => scored.person);
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

/**
 * a meeting's name without the date somebody typed into it.
 *
 * the calendar's rows are named "General Body Meeting 2026-09-08", and the
 * kiosk shows the date in its own column already. Presentation only: notion is
 * never rewritten, so a row whose name is nothing but a date keeps it rather
 * than becoming blank
 */
export function meetingLabel(name: string): string {
  const stripped = name.replace(/[\s–—-]*\d{4}-\d{2}-\d{2}\s*$/, "");
  return stripped.trim() || name.trim();
}

/** how far back the picker reaches before somebody has to pass `?meeting=` */
const WINDOW_MONTHS = 1;

/** an ISO day some number of months before another, clamped by the calendar */
function monthsBefore(day: string, months: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCMonth(at.getUTCMonth() - months);
  return at.toISOString().slice(0, 10);
}

/**
 * the meetings worth offering, newest first.
 *
 * a semester of history in one select is a list nobody reads, and the row that
 * gets tapped by accident is an old one — filing tonight's attendance against
 * a meeting last spring, silently. So the picker holds the past month and
 * everything ahead.
 *
 * `pinned` is the exception, and it is why this takes an argument rather than
 * a date alone: `?meeting=` is how somebody backfills an old meeting on
 * purpose, and a picker that dropped the meeting the page is currently showing
 * would render a select with no selection and no way back to it
 */
export function offerableMeetings(
  meetings: MeetingRecord[],
  today: string,
  pinned: string | null = null,
): MeetingRecord[] {
  const from = monthsBefore(today, WINDOW_MONTHS);

  return meetings
    .filter((meeting) => meeting.date)
    .filter(
      (meeting) =>
        meeting.date.slice(0, 10) >= from || meeting.pageId === pinned,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * the two letters an avatar falls back to when nothing is linked to Discord.
 *
 * first and last of what somebody typed, because middle names are common on a
 * roster typed from applications and "MK" for Mary Kate Ellis is the wrong
 * pair. A single name gets one letter rather than a doubled one
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";

  const first = parts[0]![0]!;
  const last = parts[parts.length - 1]![0]!;

  return (parts.length === 1 ? first : first + last).toUpperCase();
}

/**
 * what to call somebody on screen.
 *
 * always the name on their Notion row. The Discord handle belongs on the
 * Discord chip, where it says which account is linked; using it as the title
 * hid the name the room is actually looking for
 */
export function shownName(person: Person): string {
  return person.name;
}

/** the linked Discord handle, for the chip that names the account */
export function discordHandle(person: Person, faces: Faces): string | null {
  const face = person.discordId ? faces[person.discordId] : undefined;
  return face?.username ?? null;
}

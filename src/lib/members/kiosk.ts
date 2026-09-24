/*
  the kiosk's decisions: which meeting it opens on, and which names to offer
  somebody typing theirs. A wrong tap files attendance on the wrong person or
  meeting, silently. ADR 0010.
*/

import type { Faces } from "~/lib/faces";
import { normaliseName } from "./match";
import { plural } from "~/lib/utils";
import type { MeetingRecord, Person } from "./records";

/** the line under a name that tells two people apart; the whole address, since the domain is shared */
export function distinguish(person: Person): string {
  const parts: string[] = [];

  parts.push(person.email ?? "no email on file");

  if (person.contributions > 0) {
    parts.push(plural(person.contributions, "contribution"));
  }

  if (person.status) parts.push(person.status);

  return parts.join(" · ");
}

/** whether two offers would look identical on the kiosk */
export function indistinguishable(a: Person, b: Person): boolean {
  return (
    normaliseName(a.name) === normaliseName(b.name) &&
    distinguish(a) === distinguish(b)
  );
}

/**
 * the roster narrowed to what somebody has typed, prefix matches first and
 * ties by name so the order holds still mid-tap. An empty query offers nobody
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
 * today's meeting, else the latest past one; never a future one, which would
 * take tonight's attendance silently. Every type is a candidate: what counts
 * is `standing.ts`'s business
 */
export function defaultMeeting(
  meetings: MeetingRecord[],
  today: string,
): MeetingRecord | null {
  const dated = meetings
    .filter((meeting) => meeting.date)
    .filter((meeting) => meeting.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));

  return dated[0] ?? null;
}

/** a meeting's name without a trailing date, unless the date is all it has */
export function meetingLabel(name: string): string {
  const stripped = name.replace(/[\s–—-]*\d{4}-\d{2}-\d{2}\s*$/, "");
  return stripped.trim() || name.trim();
}

/** how far back the picker reaches before somebody has to pass `?meeting=` */
const WINDOW_MONTHS = 1;

function monthsBefore(day: string, months: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCMonth(at.getUTCMonth() - months);
  return at.toISOString().slice(0, 10);
}

/**
 * the past month and everything ahead, newest first, so an old meeting is
 * hard to tap by accident. `pinned` (from `?meeting=`) stays even when older,
 * or the select would lose the meeting it is showing
 */
export function offerableMeetings(
  meetings: MeetingRecord[],
  today: string,
  pinned: string | null = null,
): MeetingRecord[] {
  const from = monthsBefore(today, WINDOW_MONTHS);

  return meetings
    .filter((meeting) => meeting.date)
    .filter((meeting) => meeting.date >= from || meeting.pageId === pinned)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** an avatar's fallback: first and last initials, skipping middle names */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";

  const first = parts[0]![0]!;
  const last = parts[parts.length - 1]![0]!;

  return (parts.length === 1 ? first : first + last).toUpperCase();
}

/** the linked Discord handle, for the chip that names the account */
export function discordHandle(person: Person, faces: Faces): string | null {
  const face = person.discordId ? faces[person.discordId] : undefined;
  return face?.username ?? null;
}

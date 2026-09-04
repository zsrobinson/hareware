/*
  reading Notion dates without getting them wrong.

  two traps live here, both of which have already cost this project a reminder
  that silently did not go out. Any future watcher or command that filters a
  Notion database by day needs both, so they are here rather than inside the one
  caller that learned them. See docs/agents/silent-failures.md.
*/

import { easternNow } from "~/lib/eastern";

/** the same calendar date, shifted by whole days, still as `YYYY-MM-DD` */
export function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * a filter matching one Eastern calendar day, as Notion needs it asked.
 *
 * Notion compares dates to millisecond precision and assumes UTC when a value
 * carries no offset, so `equals: "2026-09-10"` means *midnight* and matches
 * nothing once a row has a time on it. A UTC day window is wrong the other way:
 * an 8pm Eastern meeting is already tomorrow in UTC.
 *
 * So ask for a window wide enough to hold the Eastern day under any offset, and
 * narrow it in code with `startsOn`. Both halves are required — the filter
 * alone returns neighbours, and the predicate alone has nothing to run on.
 */
export function easternDayWindow(property: string, date: string) {
  return {
    and: [
      { property, date: { on_or_after: shiftDate(date, -1) } },
      { property, date: { before: shiftDate(date, 2) } },
    ],
  };
}

/**
 * whether a Notion date value falls on the given Eastern calendar day.
 *
 * Notion writes a date with no time as a bare `YYYY-MM-DD`, which means that
 * calendar day and carries no instant to convert — running it through a
 * timezone parses it as UTC midnight and lands it on the evening before, so a
 * row with no time set is missed every time. Databases hold both shapes, so
 * both paths matter.
 */
export function startsOn(start: string, date: string) {
  if (!start.includes("T")) return start === date;
  return easternNow(new Date(start)).date === date;
}

/* filtering Notion by Eastern day. The traps are in docs/agents/silent-failures.md. */

import { easternNow } from "~/lib/eastern";

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * a filter wide enough to hold one Eastern day under any offset. `equals` on a
 * date means UTC midnight and misses any row with a time; narrow this in code
 * with `startsOn`
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
 * whether a notion date falls on an Eastern day. A bare `YYYY-MM-DD` has no
 * instant: converting it would land it on the evening before
 */
export function startsOn(start: string, date: string) {
  if (!start.includes("T")) return start === date;
  return easternNow(new Date(start)).date === date;
}

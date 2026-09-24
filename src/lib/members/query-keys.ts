/* its own module for react fast refresh; see `queries.ts` */

import type { QueryKey } from "@tanstack/react-query";

/** every roster query's key, so a mutation cannot invalidate a name nobody uses */
export const rosterKeys = {
  /* the pinned meeting is part of the answer: the route decides which
     meetings are offerable around it */
  kiosk: (meetingId = "") =>
    ["members", "kiosk", meetingId] as const satisfies QueryKey,
  reconciler: () => ["members", "reconciler"] as const satisfies QueryKey,
  /* who is in the room, apart from the roster read so a refetch that left
     before a write and lands after it cannot take a tap off the screen. Only
     ever written, never refetched */
  attendees: (meetingId = "") =>
    ["members", "attendees", meetingId] as const satisfies QueryKey,
  attendance: (meetingId = "") =>
    ["members", "attendance", meetingId] as const satisfies QueryKey,
};

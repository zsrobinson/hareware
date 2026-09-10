/*
  every roster query's key, spelled once.

  a mutation that invalidates a key nobody reads is a mutation that silently
  still needs a reload, and two string literals in two files is exactly how
  that happens.

  their own module, away from the hooks that use them, because `queries.tsx`
  exports a component: react fast refresh gives up on a module that exports
  anything but components and hooks, and a module it gives up on takes its
  importers down with it on every edit — which in a dev session is the island
  remounting and the room's sign-ins vanishing under whoever is typing.
*/

import type { QueryKey } from "@tanstack/react-query";

/** every roster query's key, so a mutation cannot invalidate a name nobody uses */
export const rosterKeys = {
  /* the pinned meeting is part of the key, because it is part of the answer:
     the route decides which meetings are offerable around it. A constant key
     with the meeting in the path only meant a refetch after a switch re-read
     the meeting the page opened on */
  kiosk: (meetingId = "") =>
    ["members", "kiosk", meetingId] as const satisfies QueryKey,
  reconciler: () => ["members", "reconciler"] as const satisfies QueryKey,
  /*
    who is in the room, kept apart from the roster read on purpose.

    it used to live inside the kiosk answer, and a revalidation of that answer
    then landed on top of writes that were still in flight: the refetch had
    left before the write and arrived after it, so somebody who had just
    tapped disappeared. Nothing about that looks like a failure on screen.

    its own key, never refetched, only written. Revalidating the roster — the
    names, the calendar, notion's statuses — can no longer touch it
  */
  attendees: (meetingId = "") =>
    ["members", "attendees", meetingId] as const satisfies QueryKey,
  /* the writes, keyed the same way, so the queue for one meeting can be read
     back without the queue for another */
  attendance: (meetingId = "") =>
    ["members", "attendance", meetingId] as const satisfies QueryKey,
};

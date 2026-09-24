/* who was at a meeting, merged against notion: see `mergeAttendance`. */

import {
  optionalList,
  requireList,
  requirePageId,
  rosterRoute,
} from "~/lib/members/api";
import { recordAttendance } from "~/lib/members/write";
import { plural } from "~/lib/utils";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    meetingId: requirePageId(body, "meetingId"),
    memberIds: requireList(body, "memberIds"),
    /* absent means add-only; defaulting to `memberIds` would add nobody */
    known: optionalList(body, "known") ?? [],
  }),
  async ({ meetingId, memberIds, known }, tokens) => {
    const attendees = await recordAttendance(
      tokens.notion,
      meetingId,
      known,
      memberIds,
    );

    return {
      summary: `recorded ${plural(attendees.length, "attendee")} for a meeting`,
      /* the merged list, which may include another device's sign-ins */
      data: { memberIds: attendees },
    };
  },
);

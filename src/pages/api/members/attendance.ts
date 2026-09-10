/*
  who was in the room, written onto a meeting.

  the device sends what it wants the list to be AND what it knew when somebody
  tapped, and the merge happens here against notion rather than in the browser.
  Sending only the wanted list is how a second device erases the first: two
  laptops each holding the same two names add one person apiece, and whoever
  writes second deletes the other's addition, silently.

  ADR 0010 still puts one laptop at the front of the room. This exists because
  a second writer arrives without anybody deciding it should: a refresh, a
  second tab, a phone opened to check something.
*/

import { env } from "cloudflare:workers";
import {
  optionalList,
  requireList,
  requireText,
  rosterRoute,
} from "~/lib/members/api";
import { knownOrSafe } from "~/lib/members/attendance";
import { recordAttendance } from "~/lib/members/write";
import { plural } from "~/lib/utils";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    meetingId: requireText(body, "meetingId"),
    /* an empty list is valid and means "everybody I knew about was a mistake" */
    memberIds: requireList(body, "memberIds"),
    /* optional so a caller that omits it can only add, never remove */
    known: optionalList(body, "known"),
  }),
  async ({ meetingId, memberIds, known }) => {
    const attendees = await recordAttendance(
      env,
      meetingId,
      knownOrSafe(known),
      memberIds,
    );

    return {
      summary: `recorded ${plural(attendees.length, "attendee")} for a meeting`,
      /* the merged list, not the one that was sent: the device may have been
         missing somebody another device signed in, and this is how it finds
         out without a reload */
      data: { memberIds: attendees },
    };
  },
);

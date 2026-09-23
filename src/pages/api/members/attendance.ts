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
    /* an empty list is valid and means "everybody I knew about was a mistake" */
    memberIds: requireList(body, "memberIds"),
    /* absent reads as empty, so a caller that omits it can only add, never
       remove. Defaulting to `memberIds` would make the write a no-op and lose
       the person who just tapped */
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
      /* the merged list, not the one that was sent: the device may have been
         missing somebody another device signed in, and this is how it finds
         out without a reload */
      data: { memberIds: attendees },
    };
  },
);

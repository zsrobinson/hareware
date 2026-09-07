/*
  who was in the room, written onto a meeting.

  the kiosk sends the whole list every time rather than the one person it just
  added, because `setAttendees` replaces the relation — see its note on why
  appending cannot express the one edit a kiosk needs, which is removing
  somebody signed in by mistake. The consequence to keep in mind is that two
  officers with the kiosk open on two laptops would overwrite each other; ADR
  0010 puts one laptop at the front of the room, and that is the reason this is
  allowed to be last-write-wins.
*/

import { env } from "cloudflare:workers";
import { requireList, requireText, rosterRoute } from "~/lib/members/api";
import { setAttendees } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    meetingId: requireText(body, "meetingId"),
    /* an empty list is valid and means "everybody signed in was a mistake" */
    memberIds: requireList(body, "memberIds"),
  }),
  async ({ meetingId, memberIds }) => {
    await setAttendees(env, meetingId, memberIds);

    return {
      summary: `recorded ${memberIds.length} attendee${memberIds.length === 1 ? "" : "s"} for a meeting`,
      data: { memberIds },
    };
  },
);

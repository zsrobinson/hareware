/*
  advancing the Google Group watermark.

  the group cannot be written by software at all — the Admin SDK wants
  Workspace admin credentials on the domain that owns it, and the club's group
  belongs to a consumer gmail account. So ADR 0010 does not sync it: HareWare
  lists the emails approved since the last time somebody pasted them in, and
  this route records that they did it again.

  the watermark is a claim about what a human did, which is why it is a button
  and not a side effect of rendering the list. It is also authoritative over
  nothing: if it drifts forward, the club re-adds somebody who is already a
  member and google treats that as a no-op. That harmless failure mode is the
  whole reason a watermark beats a maintained *In Group* checkbox.
*/

import { env } from "cloudflare:workers";
import { rosterRoute } from "~/lib/members/api";
import { easternNow } from "~/lib/eastern";
import { markGroupSynced } from "~/lib/members/group";

export const prerender = false;

export const POST = rosterRoute(
  /* no body: the date is the server's, not the browser's. a clock an hour
     behind on somebody's laptop would set a watermark that hides the people
     approved in between, and they are the ones this list exists to catch */
  () => ({}),
  async () => {
    if (!env.DB) {
      throw new Error("the watermark has nowhere to live: D1 is not bound");
    }

    /* eastern rather than utc, because the day this is compared against is an
       application's `applied`, which is the day the club would say it was */
    const today = easternNow(new Date()).date;
    await markGroupSynced(env.DB, today);

    return {
      summary: `marked the google group synced as of ${today}`,
      data: { at: today },
    };
  },
);

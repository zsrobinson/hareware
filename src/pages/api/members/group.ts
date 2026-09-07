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
import { approvedApplications } from "~/lib/services/discord/join-requests";
import {
  groupWatermark,
  markGroupSynced,
  pendingForGroup,
} from "~/lib/members/group";

export const prerender = false;

export const POST = rosterRoute(
  /* no body. what was pasted is re-derived here rather than reported by the
     browser: a page left open while three more people applied would otherwise
     mark them done without anybody having seen their addresses */
  () => ({}),
  async () => {
    if (!env.DB) {
      throw new Error("the watermark has nowhere to live: D1 is not bound");
    }
    if (!env.DISCORD_BOT_TOKEN) {
      throw new Error(
        "DISCORD_BOT_TOKEN is not set, so there is nothing to mark",
      );
    }

    /* the watermark does not depend on the applications, so one round trip
       rather than two on a button press */
    const [applications, watermark] = await Promise.all([
      approvedApplications(env.DISCORD_BOT_TOKEN),
      groupWatermark(env.DB),
    ]);

    const pending = pendingForGroup(applications, watermark);

    if (pending.length === 0) {
      return { summary: "the google group was already up to date" };
    }

    /*
      the newest `applied` day among the addresses that were actually listed —
      NOT today. Today's date would claim credit for applications that have not
      arrived yet, and the next run would start after them, which is the silent
      omission ADR 0010 refuses a cursor over.

      `pendingForGroup` sorts oldest first, so the last one is the newest
    */
    const at = pending[pending.length - 1]!.applied;
    await markGroupSynced(env.DB, at);

    return {
      summary: `marked ${pending.length} google group ${pending.length === 1 ? "address" : "addresses"} added, up to ${at}`,
      data: { at, count: pending.length },
    };
  },
);

/*
  putting an application's discord id onto an existing Members row.

  the body carries two ids and nothing else, and the route re-derives the
  decision rather than trusting the page that rendered the button. That is the
  point of this file: a resolution computed minutes ago on a client can be
  stale — the row may since have acquired an id, or a second row may have
  appeared that makes the match ambiguous — and writing a snowflake onto the
  wrong row moves that person's whole contribution history onto somebody else.

  so it reads the applications and the roster again, resolves again, and
  refuses unless the answer is still exactly `linkable` for the row that was
  asked about. The cost is two reads on a button an editor presses a handful of
  times a semester.
*/

import { env } from "cloudflare:workers";
import { BadRequest, requireText, rosterRoute } from "~/lib/members/api";
import { resolveApplication } from "~/lib/members/match";
import { people } from "~/lib/members/roster";
import { linkApplication } from "~/lib/members/write";
import { approvedApplications } from "~/lib/services/discord/join-requests";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    applicationId: requireText(body, "applicationId"),
    pageId: requireText(body, "pageId"),
  }),
  async ({ applicationId, pageId }) => {
    const [applications, roster] = await Promise.all([
      approvedApplications(env.DISCORD_BOT_TOKEN!),
      people(env.NOTION_TOKEN!),
    ]);

    const application = applications.find((one) => one.id === applicationId);
    if (!application) {
      throw new BadRequest("that application no longer exists");
    }

    const resolution = resolveApplication(roster, application);

    /*
      `linkable` and no other status. `ambiguous` and `conflicted` are the
      cases ADR 0009's rule exists for — an uncertain match asks rather than
      guesses — and `linked` means somebody already did this, in which case
      writing again would be harmless but the log would claim work that was
      not done
    */
    if (
      resolution.status !== "linkable" ||
      resolution.person.pageId !== pageId
    ) {
      throw new BadRequest(
        `that application now resolves to ${resolution.status}, so it is not safe to link. The page has been re-read; look at it again`,
      );
    }

    await linkApplication(env, resolution.person, application);

    return {
      summary: `linked ${application.name ?? application.username}'s application to ${resolution.person.name} on ${resolution.on}`,
      data: { pageId, discordId: application.discordId },
    };
  },
);

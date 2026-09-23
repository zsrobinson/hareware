/* links an application to a row, re-resolving it first: the page's answer may
   be stale, and a wrong link moves somebody's history onto another person. */

import {
  BadRequest,
  requirePageId,
  requireText,
  rosterRoute,
} from "~/lib/members/api";
import { resolveApplication } from "~/lib/members/match";
import { people } from "~/lib/members/roster";
import { linkApplication } from "~/lib/members/write";
import { approvedApplications } from "~/lib/members/applications";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    applicationId: requireText(body, "applicationId"),
    pageId: requirePageId(body, "pageId"),
  }),
  async ({ applicationId, pageId }, tokens) => {
    const [applications, roster] = await Promise.all([
      approvedApplications(tokens.discord),
      people(tokens.notion),
    ]);

    const application = applications.find((one) => one.id === applicationId);
    if (!application) {
      throw new BadRequest("that application no longer exists");
    }

    const resolution = resolveApplication(roster, application);

    /* only `linkable`; `linked` would log work that was not done */
    if (
      resolution.status !== "linkable" ||
      resolution.person.pageId !== pageId
    ) {
      throw new BadRequest(
        `that application now resolves to ${resolution.status}, so it is not safe to link. The page has been re-read; look at it again`,
      );
    }

    await linkApplication(tokens.notion, resolution.person, application);

    return {
      summary: `linked ${application.name ?? application.username}'s application to ${resolution.person.name} on ${resolution.on}`,
      data: { pageId, discordId: application.discordId },
    };
  },
);

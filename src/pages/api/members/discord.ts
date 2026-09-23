/*
  linking a Members row to a discord account from the kiosk.

  the id is checked against the guild rather than accepted: the island offers
  an autocomplete over the member list, but the island is not trusted for any
  of this — a snowflake typed into a request by hand would attach somebody's
  whole contribution history to an account that is not in the club.

  a snowflake already on another row is refused for the same reason from the
  other side. Two rows carrying one discord id is precisely the duplicate the
  reconciler exists to find, and creating one here would be creating work.
*/

import {
  BadRequest,
  requireFreeDiscordId,
  requirePageId,
  requireText,
  rosterRoute,
} from "~/lib/members/api";
import { people } from "~/lib/members/roster";
import { updateMember } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    pageId: requirePageId(body, "pageId"),
    discordId: requireText(body, "discordId"),
  }),
  async ({ pageId, discordId }, tokens) => {
    const roster = await people(tokens.notion);

    const person = roster.find((one) => one.pageId === pageId);
    if (!person) throw new BadRequest("that row is no longer on the roster");

    const profile = await requireFreeDiscordId(
      tokens.discord,
      discordId,
      roster,
      pageId,
    );

    await updateMember(tokens.notion, pageId, { discordId });

    return {
      summary: `linked ${person.name} to ${profile.username} on Discord from the kiosk`,
      data: { pageId, discordId },
    };
  },
);

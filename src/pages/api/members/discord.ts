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

import { env } from "cloudflare:workers";
import { BadRequest, requireText, rosterRoute } from "~/lib/members/api";
import { people } from "~/lib/members/roster";
import { updateMember } from "~/lib/members/write";
import { requireGuildMembers } from "~/lib/member";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    pageId: requireText(body, "pageId"),
    name: requireText(body, "name"),
    discordId: requireText(body, "discordId"),
  }),
  async ({ pageId, name, discordId }) => {
    const [guild, roster] = await Promise.all([
      requireGuildMembers(env.DISCORD_BOT_TOKEN),
      people(env.NOTION_TOKEN!),
    ]);

    const profile = guild.get(discordId);
    if (!profile) {
      throw new BadRequest(
        "that account is not in the server, so an editor has to send them an invite first",
      );
    }

    const taken = roster.find(
      (person) => person.discordId === discordId && person.pageId !== pageId,
    );
    if (taken) {
      throw new BadRequest(
        `${taken.name} already has that Discord account, so the two rows are the same person — merge them in the reconciler`,
      );
    }

    await updateMember(env, pageId, { discordId });

    return {
      summary: `linked ${name} to ${profile.username} on Discord from the kiosk`,
      data: { pageId, discordId },
    };
  },
);

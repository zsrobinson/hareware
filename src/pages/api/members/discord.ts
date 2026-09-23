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

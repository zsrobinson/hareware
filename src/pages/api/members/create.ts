/* a Members row for somebody new, usually at the kiosk. The email is required:
   it is what later links their application to this row. */

import {
  optionalText,
  requireEmail,
  requireFreeDiscordId,
  requireStatus,
  requireText,
  rosterRoute,
} from "~/lib/members/api";
import { people } from "~/lib/members/roster";
import { createMember } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    name: requireText(body, "name"),
    email: requireEmail(body, "email"),
    status: optionalText(body, "status"),
    discordId: optionalText(body, "discordId"),
  }),
  async ({ name, email, status, discordId }, tokens) => {
    if (status) await requireStatus(tokens.notion, status);

    if (discordId) {
      await requireFreeDiscordId(
        tokens.discord,
        discordId,
        await people(tokens.notion),
        null,
      );
    }

    const pageId = await createMember(tokens.notion, {
      name,
      email,
      ...(status ? { status } : {}),
      ...(discordId ? { discordId } : {}),
    });

    return {
      summary: `created a Members row for ${name}`,
      data: { pageId, name, email },
    };
  },
);

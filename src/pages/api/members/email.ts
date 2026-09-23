/*
  putting an address on a Members row, typically the row's own owner doing it
  at the kiosk.

  the email is the merge key ADR 0010 rests on: an application arriving weeks
  later resolves to `linkable` on an address match, and a row without one waits
  for a human. So this is the edit most worth making easy, and the guidance
  toward a umd address lives beside the field rather than being enforced here —
  somebody with only a personal address is still a member.
*/

import { requireEmail, requirePageId, rosterRoute } from "~/lib/members/api";
import { member } from "~/lib/members/roster";
import { updateMember } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    pageId: requirePageId(body, "pageId"),
    email: requireEmail(body, "email"),
  }),
  async ({ pageId, email }, tokens) => {
    const person = await member(tokens.notion, pageId);

    await updateMember(tokens.notion, pageId, { email });

    return {
      summary: `set ${person.name}'s email from the kiosk`,
      data: { pageId, email },
    };
  },
);

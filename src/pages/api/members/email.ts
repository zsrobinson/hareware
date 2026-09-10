/*
  putting an address on a Members row, typically the row's own owner doing it
  at the kiosk.

  the email is the merge key ADR 0010 rests on: an application arriving weeks
  later resolves to `linkable` on an address match, and a row without one waits
  for a human. So this is the edit most worth making easy, and the guidance
  toward a umd address lives beside the field rather than being enforced here —
  somebody with only a personal address is still a member.
*/

import { env } from "cloudflare:workers";
import { BadRequest, requireText, rosterRoute } from "~/lib/members/api";
import { updateMember } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => {
    const email = requireText(body, "email");
    /* notion's email property refuses a malformed address with a 400 whose
       message names the property and not the value, so the shape is checked
       here where the reply can say what to fix */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequest(`${email} is not an email address`);
    }

    return {
      pageId: requireText(body, "pageId"),
      name: requireText(body, "name"),
      email,
    };
  },
  async ({ pageId, name, email }) => {
    await updateMember(env, pageId, { email });

    return {
      summary: `set ${name}'s email from the kiosk`,
      data: { pageId, email },
    };
  },
);

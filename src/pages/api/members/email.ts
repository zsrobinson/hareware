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

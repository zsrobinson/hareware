import {
  requirePageId,
  requireStatus,
  requireText,
  rosterRoute,
} from "~/lib/members/api";
import { member } from "~/lib/members/roster";
import { updateMember } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    pageId: requirePageId(body, "pageId"),
    status: requireText(body, "status"),
  }),
  async ({ pageId, status }, tokens) => {
    const [person] = await Promise.all([
      member(tokens.notion, pageId),
      requireStatus(tokens.notion, status),
    ]);

    await updateMember(tokens.notion, pageId, { status });

    return {
      summary: `set ${person.name}'s status to ${status}`,
      data: { pageId, status },
    };
  },
);

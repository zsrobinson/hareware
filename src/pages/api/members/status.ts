/*
  setting the one field in ADR 0010's design that a human maintains.

  `Status` cannot be derived and cannot be nagged about: graduation year is
  deliberately not recorded, so there is no date to compare it against. That is
  an accepted cost rather than an oversight — a stored year is wrong more often
  than it is useful — and the mitigation is that the reconciler lists everybody
  whose status is empty, and this route is the button beside each of them.

  the value is checked against the live select options rather than a list in
  this repository. Notion's `select` accepts a name it has never seen and adds
  it, so an unchecked write is how a fourth status appears by typo — and a page
  offering four options when notion has three is the same bug arriving from the
  other side.
*/

import { env } from "cloudflare:workers";
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
  async ({ pageId, status }) => {
    const [person] = await Promise.all([
      member(env.NOTION_TOKEN!, pageId),
      requireStatus(status),
    ]);

    await updateMember(env, pageId, { status });

    return {
      summary: `set ${person.name}'s status to ${status}`,
      data: { pageId, status },
    };
  },
);

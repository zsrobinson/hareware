/*
  setting the one field in ADR 0010's design that a human maintains.

  `Status` cannot be derived and cannot be nagged about: graduation year is
  deliberately not recorded, so there is no date to compare it against. That is
  an accepted cost rather than an oversight — a stored year is wrong more often
  than it is useful — and the mitigation is that the reconciler lists everybody
  whose status is empty, and this route is the button beside each of them.

  the value is checked against the select's options rather than passed through.
  A typo'd status is read as unknown by `roster.ts`, and an unknown status is
  a person the standing page flags instead of counting — so a bad write here
  would quietly move somebody into the "we do not know" column.
*/

import { env } from "cloudflare:workers";
import { BadRequest, requireText, rosterRoute } from "~/lib/members/api";
import { isMemberStatus } from "~/lib/members/config";
import { updateMember } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => {
    const status = requireText(body, "status");
    if (!isMemberStatus(status)) {
      throw new BadRequest(`${status} is not one of the statuses notion has`);
    }

    return {
      pageId: requireText(body, "pageId"),
      name: requireText(body, "name"),
      status,
    };
  },
  async ({ pageId, name, status }) => {
    await updateMember(env, pageId, { status });

    return {
      summary: `set ${name}'s status to ${status}`,
      data: { pageId, status },
    };
  },
);

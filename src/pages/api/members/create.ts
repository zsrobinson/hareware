/*
  a Members row for somebody the roster has never heard of.

  ADR 0010's consequence that matters: the kiosk is an identity source, not
  only an event source. Somebody attends their first general body meeting
  before they ever apply on discord, so a row has to be creatable from a name
  and an email with no snowflake attached.

  the email is required here rather than merely asked for. It is the merge key:
  when the application arrives weeks later, an email match plus name agreement
  is what lets `resolveApplication` return `linkable` instead of leaving a
  human to guess, and a row created without one is a row that will need a
  person to reconcile it by hand.
*/

import { env } from "cloudflare:workers";
import {
  BadRequest,
  optionalText,
  requireText,
  rosterRoute,
} from "~/lib/members/api";
import { statusOptions } from "~/lib/members/roster";
import { createMember } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    name: requireText(body, "name"),
    email: requireText(body, "email"),
    status: optionalText(body, "status"),
  }),
  async ({ name, email, status }) => {
    /* checked against the live options for the reason `status.ts` gives: a
       notion select accepts a name it has never seen and adds it */
    if (status) {
      const options = await statusOptions(env.NOTION_TOKEN!);
      if (!options.includes(status)) {
        throw new BadRequest(
          `${status} is not one of the statuses Notion has: ${options.join(", ")}`,
        );
      }
    }

    const pageId = await createMember(env, {
      name,
      email,
      ...(status ? { status } : {}),
    });

    return {
      summary: `created a Members row for ${name} from the kiosk`,
      /* returned so the kiosk can mark them present without re-reading the
         roster — the person is standing at the laptop waiting */
      data: { pageId, name, email },
    };
  },
);

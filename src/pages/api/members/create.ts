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
import { people, statusOptions } from "~/lib/members/roster";
import { createMember } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    name: requireText(body, "name"),
    email: requireText(body, "email"),
    status: optionalText(body, "status"),
    /* the kiosk creates people who have no Discord account yet; the reconciler
       creates them from an application, which is nothing but an account */
    discordId: optionalText(body, "discordId"),
  }),
  async ({ name, email, status, discordId }) => {
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

    /*
      refused rather than overwritten, the same way `discord.ts` refuses it
      from the other side: two rows carrying one snowflake is precisely the
      duplicate the reconciler exists to find, and making one here would be
      making work
    */
    if (discordId) {
      const taken = (await people(env.NOTION_TOKEN!)).find(
        (person) => person.discordId === discordId,
      );
      if (taken) {
        throw new BadRequest(
          `${taken.name} already has that Discord account, so this application belongs to their row`,
        );
      }
    }

    const pageId = await createMember(env, {
      name,
      email,
      ...(status ? { status } : {}),
      ...(discordId ? { discordId } : {}),
    });

    return {
      summary: `created a Members row for ${name}`,
      /* returned so the kiosk can mark them present without re-reading the
         roster — the person is standing at the laptop waiting */
      data: { pageId, name, email },
    };
  },
);

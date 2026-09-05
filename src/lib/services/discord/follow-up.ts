/*
  finishing an interaction that was deferred.

  `deferEphemeral()` in `interactions.ts` buys time by telling discord
  "HareWare is thinking…"; this is the other half, and the message it edits is
  the one that spinner turned into. ADR 0009 has the reasoning for the split:
  a notion read plus a PATCH does not fit inside discord's three seconds.

  the rule this file exists to keep is that **something is always sent**. an
  acknowledged interaction left silent is the exact shape
  `docs/agents/silent-failures.md` is about — the editor watches a spinner
  settle into nothing and cannot tell a refused write from a slow one — so
  every branch here ends in a request, and the ones that cannot make one say
  why in a `Result` rather than throwing into a background task nobody reads.
*/

import { failed, misconfigured, ok, type Result } from "~/lib/result";

import { IS_COMPONENTS_V2, textMessage, type CommandMessage } from "./message";

/**
 * how long the interaction token is good for.
 *
 * fifteen minutes from the interaction, not from the deferral. nothing here
 * enforces it — it is discord's clock — but a caller queueing work behind a
 * retry needs the number, and after it the follow-up comes back 401 with the
 * editor's spinner still spinning
 */
export const TOKEN_LIFETIME_MS = 15 * 60 * 1000;

/** what an editor sees when a command produced no words of its own */
const NOTHING_SAID =
  "HareWare finished, but had nothing to say about it. That is a bug — check `/admin/log`.";

/** the message a deferred interaction turned into */
export function followUpUrl(applicationId: string, interactionToken: string) {
  return `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
}

/**
 * replaces the "HareWare is thinking…" placeholder with the outcome.
 *
 * never throws, and never sends an empty body. returns a `Result` so the
 * caller logs the follow-up the same way it logs the write it was reporting —
 * a write that landed and a reply that did not arrive are different mornings.
 */
export async function followUp(
  applicationId: string,
  interactionToken: string,
  message: CommandMessage,
): Promise<Result> {
  const missing = [
    !applicationId && "application id",
    !interactionToken && "interaction token",
  ].filter(Boolean);

  /*
    refused before the request rather than after: an empty segment collapses
    the path into a different, valid-looking url, and discord answers it with a
    404 that reads like an expired token
  */
  if (missing.length > 0)
    return misconfigured(
      `cannot follow up without the ${missing.join(" and ")}`,
    );

  const body = message.components.length ? message : textMessage(NOTHING_SAID);

  try {
    const response = await fetch(followUpUrl(applicationId, interactionToken), {
      method: "PATCH",
      /*
        no authorization header, deliberately. the interaction token in the url
        *is* the credential for this endpoint, and adding `Bot …` makes discord
        reject the request — so its absence is the design and not an omission
      */
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        flags: IS_COMPONENTS_V2,
        allowed_mentions: { parse: [] },
      }),
    });

    if (!response.ok) {
      // read the body either way: 401 here means the token expired, and that
      // is a different problem from a malformed message
      const body = await response.text();
      return failed(
        `discord refused the follow-up: ${response.status} ${body.slice(0, 300)}`,
      );
    }

    return ok("followed up on the interaction");
  } catch (error) {
    return failed(`could not reach discord to follow up: ${String(error)}`);
  }
}

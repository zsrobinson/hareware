/*
  Finishing a deferred interaction (ADR 0009). Something is always sent, or a
  `Result` says why not: a silent deferral leaves the editor a spinner.
*/

import { failed, misconfigured, ok, type Result } from "~/lib/result";

import {
  IS_COMPONENTS_V2,
  markup,
  textMessage,
  type CommandMessage,
} from "./message";

const NOTHING_SAID = markup`HareWare finished, but had nothing to say about it. That is a bug. Check \`/log\`.`;

function followUpUrl(applicationId: string, interactionToken: string) {
  return `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
}

/**
 * replaces the "HareWare is thinking…" placeholder. Never throws or sends an
 * empty body.
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

  /* an empty segment makes a valid-looking url that 404s like an expired token */
  if (missing.length > 0)
    return misconfigured(
      `cannot follow up without the ${missing.join(" and ")}`,
    );

  const body = message.components.length ? message : textMessage(NOTHING_SAID);

  try {
    const response = await fetch(followUpUrl(applicationId, interactionToken), {
      method: "PATCH",
      /* no authorization: the token in the url is the credential, and `Bot …`
         makes Discord reject the request */
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        flags: IS_COMPONENTS_V2,
        allowed_mentions: { parse: [] },
      }),
    });

    if (!response.ok) {
      // 401 means the token expired, unlike a malformed message
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

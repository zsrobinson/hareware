/*
  posting to discord through a channel webhook url, which is the whole of our
  discord integration: no application, no bot token, no oauth. the url is the
  credential and it can do exactly one thing — post into the one channel it was
  made for
*/

/** a link button. style 5 is a url button, which fires no interaction */
export type LinkButton = { label: string; url: string };

export type DiscordEmbed = {
  title?: string;
  url?: string;
  description?: string;
  footer?: { text: string };
};

export type DiscordMessage = {
  content?: string;
  embeds?: DiscordEmbed[];
  /** rendered as one action row of link buttons beneath the message */
  buttons?: LinkButton[];
  /** role ids this message is permitted to ping; everything else is inert */
  mentionRoleIds?: string[];
};

export class DiscordPostError extends Error {}

export async function postToWebhook(
  webhookUrl: string,
  message: DiscordMessage,
  options: { dryRun?: boolean } = {},
) {
  /*
    a non-application-owned webhook drops components unless this is set — and
    drops them *silently*, returning 204 either way, so a missing button looks
    exactly like a success. link buttons are non-interactive, which is why they
    survive at all; a real "mark as posted" button needs an application
  */
  const url = new URL(webhookUrl);
  url.searchParams.set("with_components", "true");
  // ask for the created message back, so the check below has something to read
  url.searchParams.set("wait", "true");

  const body = {
    content: message.content,
    embeds: message.embeds,
    components: message.buttons?.length
      ? [
          {
            type: 1,
            components: message.buttons.map((button) => ({
              type: 2,
              style: 5,
              label: button.label,
              url: button.url,
            })),
          },
        ]
      : undefined,
    /*
      never inherit discord's default, which lets a message ping @everyone.
      naming the roles explicitly with an empty `parse` means this message can
      mention the duty role and nothing else, whatever ends up in its text
    */
    allowed_mentions: {
      parse: [] as string[],
      roles: message.mentionRoleIds ?? [],
    },
  };

  if (options.dryRun) {
    // the whole point is to see the payload without a channel full of tests
    console.log("[discord dry run]", JSON.stringify(body, null, 2));
    return;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new DiscordPostError(
      `discord returned ${response.status}: ${await response.text()}`,
    );
  }

  /*
    discord drops components it will not accept and still answers as though it
    posted them, so a button that never rendered looks exactly like one that
    did. `wait=true` hands back the message as stored — if we asked for buttons
    and none came back, say so, because nothing else ever will
  */
  const created = (await response.json()) as { components?: unknown[] };
  if (message.buttons?.length && !created.components?.length) {
    console.error(
      "[discord] the message posted but its buttons were dropped — a webhook " +
        "that is not application-owned can only send link buttons",
    );
  }
}

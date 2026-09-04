/*
  posting to discord through a channel webhook url, which is the whole of our
  discord integration: no application, no bot token, no oauth. the url is the
  credential and it can do exactly one thing — post into the one channel it was
  made for.

  messages are built with components v2, where the layout *is* the message:
  `content` and `embeds` are unavailable once the flag is set, and text,
  buttons and dividers are all components instead
*/

const IS_COMPONENTS_V2 = 1 << 15;

/** discord's component type numbers, named so the payload reads as something */
const TEXT_DISPLAY = 10;
const ACTION_ROW = 1;
const BUTTON = 2;
const SEPARATOR = 14;
const LINK_STYLE = 5;
const PRIMARY_STYLE = 1;

/** a url button. it fires no interaction, so any webhook may send one */
export type LinkButton = { label: string; url: string };

/**
 * a button that calls us back.
 *
 * only an *application-owned* webhook may send one — discord answers 400 for
 * anything else, which is what the reminders hit before the bot created these
 * webhooks itself. the id comes back on the interaction, and is how the handler
 * knows which button was pressed
 */
export type ActionButton = { label: string; id: string };

export type Button = LinkButton | ActionButton;

export type Block =
  | { kind: "text"; content: string }
  | { kind: "buttons"; buttons: Button[] }
  | { kind: "separator" };

export const text = (content: string): Block => ({ kind: "text", content });
export const buttons = (...buttons: Button[]): Block => ({
  kind: "buttons",
  buttons,
});
export const separator = (): Block => ({ kind: "separator" });

export type DiscordMessage = {
  blocks: Block[];
  /** role ids this message may ping; every other mention in it stays inert */
  mentionRoleIds?: string[];
};

export class DiscordPostError extends Error {}

function render(block: Block) {
  switch (block.kind) {
    case "text":
      return { type: TEXT_DISPLAY, content: block.content };
    case "buttons":
      return {
        type: ACTION_ROW,
        components: block.buttons.map((button) =>
          "url" in button
            ? {
                type: BUTTON,
                style: LINK_STYLE,
                label: button.label,
                url: button.url,
              }
            : {
                type: BUTTON,
                style: PRIMARY_STYLE,
                label: button.label,
                custom_id: button.id,
              },
        ),
      };
    case "separator":
      return { type: SEPARATOR, spacing: 1, divider: false };
  }
}

export async function postToWebhook(
  webhookUrl: string,
  message: DiscordMessage,
  options: { dryRun?: boolean; silent?: boolean } = {},
) {
  const url = new URL(webhookUrl);
  // without this a webhook that is not application-owned sends no components
  url.searchParams.set("with_components", "true");
  // ask for the created message back, so the check below has something to read
  url.searchParams.set("wait", "true");

  const components = message.blocks.map(render);

  const body = {
    flags: IS_COMPONENTS_V2,
    components,
    /*
      never inherit discord's default, which lets a message ping @everyone.
      naming the roles explicitly with an empty `parse` means this message can
      mention the duty role and nothing else, whatever ends up in its text
    */
    allowed_mentions: {
      parse: [] as string[],
      /*
        `silent` empties this and nothing else. discord still renders `<@&id>`
        as the role's name either way — what the list controls is whether
        anyone is notified, so a silent run looks identical and pings nobody
      */
      roles: options.silent ? [] : (message.mentionRoleIds ?? []),
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
    discord drops components it will not render and still answers as though it
    posted them, so a button that never appeared looks exactly like one that
    did. `wait=true` hands back the message as stored — if fewer blocks came
    back than we sent, say so, because nothing else ever will.

    an *interactive* button is the likelier trip-wire, and that one is refused
    outright with a 400 above: only an application may send those
  */
  const created = (await response.json()) as { components?: unknown[] };
  if ((created.components?.length ?? 0) < components.length) {
    console.error(
      `[discord] posted, but ${components.length - (created.components?.length ?? 0)} ` +
        "of its blocks were dropped",
    );
  }
}

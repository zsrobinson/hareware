/*
  Posting to Discord as the bot, in Components V2: with the flag set there is
  no `content` or `embeds`, only components.
*/

import { ROLE_NAMES } from "./config";

const IS_COMPONENTS_V2 = 1 << 15;

/** Discord's component types */
const TEXT_DISPLAY = 10;
const ACTION_ROW = 1;
const BUTTON = 2;
const SEPARATOR = 14;
const LINK_STYLE = 5;

/** Discord's non-link button styles */
const STYLES = { primary: 1, secondary: 2, success: 3, danger: 4 } as const;

export type LinkButton = { label: string; url: string };

/** a button that calls our interactions endpoint back */
export type ActionButton = {
  label: string;
  id: string;
  style?: keyof typeof STYLES;
};

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

class DiscordPostError extends Error {}

const ROLE_MENTION = /<@&(\d+)>/g;
const BROADCAST = /@(everyone|here)/gi;
/** `](`, which makes bracketed text a link with a hidden target */
const MASKED_LINK = /\]\(/g;
/** user, role or channel references */
const REFERENCE = /<(@[!&]?|#)(\d+)>/g;

/** a zero-width space: breaks the markup without changing how it looks */
const BREAK = "\u200b";

/**
 * Remote text, unable to mention anybody or carry a masked link. Required:
 * `allowed_mentions` does not gate mentions in a V2 text display
 * (docs/agents/silent-failures.md).
 */
export function inert(value: string) {
  return value
    .replace(BROADCAST, `@${BREAK}$1`)
    .replace(REFERENCE, `<${BREAK}$1$2>`)
    .replace(MASKED_LINK, `](${BREAK}`);
}

/**
 * The block with role mentions replaced by the role's name. Not writing the
 * markup is the only way not to ping (docs/agents/silent-failures.md).
 */
function defuse(block: Block): Block {
  if (block.kind !== "text") return block;

  return {
    ...block,
    content: block.content.replace(
      ROLE_MENTION,
      (markup, id: string) => `@${ROLE_NAMES[id] ?? markup}`,
    ),
  };
}

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
                style: STYLES[button.style ?? "primary"],
                label: button.label,
                custom_id: button.id,
              },
        ),
      };
    case "separator":
      return { type: SEPARATOR, spacing: 1, divider: false };
  }
}

export async function postMessage(
  token: string,
  channelId: string,
  message: DiscordMessage,
  options: { dryRun?: boolean; silent?: boolean; testChannelId?: string } = {},
) {
  /* the channels are constants: without REMINDERS_TEST_CHANNEL a local run
     posts to the club's real ones */
  const channel = options.testChannelId || channelId;
  const blocks = options.silent ? message.blocks.map(defuse) : message.blocks;

  const body = {
    flags: IS_COMPONENTS_V2,
    components: blocks.map(render),
    /* Discord's default lets a message ping @everyone */
    allowed_mentions: {
      parse: [] as string[],
      roles: options.silent ? [] : (message.mentionRoleIds ?? []),
    },
  };

  if (options.dryRun) {
    console.log("[discord dry run]", JSON.stringify(body, null, 2));
    return;
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${channel}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new DiscordPostError(
      `discord returned ${response.status}: ${await response.text()}`,
    );
  }
}

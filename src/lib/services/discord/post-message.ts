/*
  posting to discord as the bot itself.

  messages come from the application's own user, so clicking the name shows a
  real profile and the avatar is the one set in the developer portal. the
  alternative — a webhook per channel — makes the author a dead end, needs its
  own avatar, and turns every channel into a url that is a credential.

  messages are built with components v2, where the layout *is* the message:
  `content` and `embeds` are unavailable once the flag is set, and text,
  buttons and dividers are all components instead
*/

import { ROLE_NAMES } from "./config";

const IS_COMPONENTS_V2 = 1 << 15;

/** discord's component type numbers, named so the payload reads as something */
const TEXT_DISPLAY = 10;
const ACTION_ROW = 1;
const BUTTON = 2;
const SEPARATOR = 14;
const LINK_STYLE = 5;

/** discord's button styles, of the four that are not links */
const STYLES = { primary: 1, secondary: 2, success: 3, danger: 4 } as const;

/** a url button. it fires no interaction */
export type LinkButton = { label: string; url: string };

/** a button that calls our interactions endpoint back */
export type ActionButton = {
  label: string;
  id: string;
  /** defaults to primary. `danger` is discord's red */
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

export class DiscordPostError extends Error {}

/** `<@&123>` as discord writes it, wherever it appears in a line */
const ROLE_MENTION = /<@&(\d+)>/g;

/** `@everyone` and `@here`, which need no id and ping the most people */
const BROADCAST = /@(everyone|here)/gi;

/** any of discord's `<...>` references: user, role or channel */
const REFERENCE = /<(@[!&]?|#)(\d+)>/g;

/*
  a zero-width space, which is what breaks a mention without changing how the
  line looks. discord parses the markup by shape, so one invisible character
  inside it is the difference between a ping and the literal text
*/
const BREAK = "\u200b";

/**
 * remote text, made unable to mention anybody.
 *
 * a wordpress headline and a notion location both land in a text display that
 * also carries a real role mention, and `allowed_mentions` does not gate a
 * mention inside a components v2 text display — that is the whole reason
 * `defuse` exists below. so anything written by somebody outside this codebase
 * goes through here first: a headline reading "@everyone" is a mistake at best
 * and a way to ping the whole server from the club's own bot at worst.
 *
 * the result renders identically. only the parser can tell the difference
 */
export function inert(value: string) {
  return value
    .replace(BROADCAST, `@${BREAK}$1`)
    .replace(REFERENCE, `<${BREAK}$1$2>`);
}

/**
 * the same block with its mentions turned into plain text.
 *
 * `allowed_mentions` does not gate a mention inside a components v2 text
 * display — an empty roles array notifies the role exactly as though the field
 * were absent — so the only way not to ping is not to write the markup. the
 * role's name goes in its place, and the message reads the same
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
  /*
    the channels are constants, so without this every local run would post to
    the club's real ones. REMINDERS_TEST_CHANNEL redirects both reminders to
    one channel and belongs in .dev.vars
  */
  const channel = options.testChannelId || channelId;
  const blocks = options.silent ? message.blocks.map(defuse) : message.blocks;

  const body = {
    flags: IS_COMPONENTS_V2,
    components: blocks.map(render),
    /*
      never inherit discord's default, which lets a message ping @everyone.
      naming the roles explicitly with an empty `parse` means this message can
      mention the duty role and nothing else, whatever ends up in its text
    */
    allowed_mentions: {
      parse: [] as string[],
      roles: options.silent ? [] : (message.mentionRoleIds ?? []),
    },
  };

  if (options.dryRun) {
    // the whole point is to see the payload without a channel full of tests
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

  /*
    discord refuses a message it cannot render rather than posting a broken
    one — an interactive button missing its custom_id takes the whole message
    down with it — so there is nothing to check afterwards, only to report
  */
  if (!response.ok) {
    throw new DiscordPostError(
      `discord returned ${response.status}: ${await response.text()}`,
    );
  }
}

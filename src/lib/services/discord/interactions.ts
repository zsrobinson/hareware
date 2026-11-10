/*
  Routes verified Discord interactions. The only one HareWare puts anywhere is
  the social reminder's "Not posted" button.
*/

import { IS_COMPONENTS_V2, type Component } from "./message";
import { POSTED_PREFIX, togglePosted } from "./posted-button";

/** interaction types */
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;

/** response types */
const PONG = 1;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;
const UPDATE_MESSAGE = 7;

const EPHEMERAL = 64;

type DiscordUser = {
  id?: string;
  username?: string;
  global_name?: string | null;
};

export type Interaction = {
  type: number;
  data?: { custom_id?: string; name?: string };
  message?: { components?: Component[] };
  member?: { nick?: string | null; user?: DiscordUser };
  user?: DiscordUser;
};

export type InteractionResponse = {
  type: number;
  data?: {
    flags?: number;
    content?: string;
    components?: Component[];
    allowed_mentions?: { parse: string[] };
  };
};

export function handleInteraction(
  interaction: Interaction,
): InteractionResponse | undefined {
  if (interaction.type === PING) return { type: PONG };

  /* A command registered by an older deploy still reaches here until Discord
     forgets it. Unanswered, it reads as "HareWare didn't respond". */
  if (interaction.type === APPLICATION_COMMAND)
    return {
      type: CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: EPHEMERAL,
        content: `HareWare no longer has a /${interaction.data?.name ?? "command"} command.`,
        allowed_mentions: { parse: [] },
      },
    };

  if (interaction.type === MESSAGE_COMPONENT) {
    const id = interaction.data?.custom_id;
    if (!id?.startsWith(POSTED_PREFIX)) return undefined;

    const components = interaction.message?.components;
    if (!components) return undefined;

    return {
      type: UPDATE_MESSAGE,
      data: {
        flags: IS_COMPONENTS_V2,
        components: togglePosted(components, id, who(interaction)),
      },
    };
  }

  return undefined;
}

/**
 * The log's line for a press of the posted button — "Zachary marked some-slug
 * posted" — reading the new state from the reply, which is what Discord shows.
 */
export function describePress(
  interaction: Interaction,
  reply: InteractionResponse,
): string | undefined {
  const id = interaction.data?.custom_id;
  if (interaction.type !== MESSAGE_COMPONENT || !id?.startsWith(POSTED_PREFIX))
    return undefined;

  const slug = id.slice(POSTED_PREFIX.length);
  const label = find(reply.data?.components ?? [], id)?.label;
  const state =
    label === "Not posted"
      ? "not posted"
      : typeof label === "string" && label.startsWith("Posted")
        ? "posted"
        : undefined;

  return state
    ? `${who(interaction)} marked ${slug} ${state}`
    : `${who(interaction)} pressed the button for ${slug}`;
}

function find(components: Component[], id: string): Component | undefined {
  for (const component of components) {
    if (component.custom_id === id) return component;
    const nested = find(component.components ?? [], id);
    if (nested) return nested;
  }
  return undefined;
}

/** the display name to credit, preferring what a member chose to be called */
function who(interaction: Interaction): string {
  const user = interaction.member?.user ?? interaction.user;
  return (
    interaction.member?.nick || user?.global_name || user?.username || "someone"
  );
}

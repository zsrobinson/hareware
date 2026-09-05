import {
  IS_COMPONENTS_V2,
  textMessage,
  type CommandMessage,
  type Component,
} from "./message";
import type { AutocompleteChoice } from "./article-picker";

const EPHEMERAL = 64;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;
const DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5;

export type MessageResponse = {
  type: number;
  data?: {
    flags: number;
    components?: Component[];
    allowed_mentions?: { parse: string[] };
  };
};

export type BodyResponse = MessageResponse & {
  data: { flags: number; components: Component[] };
};

export type AutocompleteResponse = {
  type: number;
  data: { choices: AutocompleteChoice[] };
};

export type InteractionResponse = MessageResponse | AutocompleteResponse;

/** Components V2 and ephemeral must be set together on a body response. */
export function ephemeral(content: string | CommandMessage): BodyResponse {
  const { components } =
    typeof content === "string" ? textMessage(content) : content;

  return {
    type: CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: EPHEMERAL | IS_COMPONENTS_V2,
      components,
      allowed_mentions: { parse: [] },
    },
  };
}

/** A deferred acknowledgement carries no body and therefore no V2 flag. */
export function deferEphemeral(): MessageResponse {
  return {
    type: DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: EPHEMERAL },
  };
}

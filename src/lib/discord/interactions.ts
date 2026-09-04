/*
  what happens when somebody presses a button on one of our messages.

  the whole exchange is one request and one reply, with nothing fetched in
  between: discord hands us the message the button belongs to and the member who
  pressed it, and we hand back the message with that button changed. that is why
  this needs no store — the message is the record of what has been posted — and
  why discord's three-second deadline is never in play
*/

const IS_COMPONENTS_V2 = 1 << 15;

/** interaction types, of which we answer two */
const PING = 1;
const MESSAGE_COMPONENT = 3;

/** response types */
const PONG = 1;
const UPDATE_MESSAGE = 7;

const BUTTON = 2;
const SUCCESS_STYLE = 3;

/** discord truncates nothing for us; a button label over 80 chars is rejected */
const MAX_LABEL = 80;

export const POSTED_PREFIX = "posted:";

/** a custom_id must be unique within a message and at most 100 characters */
export function postedId(slug: string) {
  return `${POSTED_PREFIX}${slug}`.slice(0, 100);
}

type Component = {
  type: number;
  custom_id?: string;
  components?: Component[];
  [key: string]: unknown;
};

type Interaction = {
  type: number;
  data?: { custom_id?: string };
  message?: { components?: Component[] };
  member?: { user?: { username?: string; global_name?: string | null } };
  user?: { username?: string; global_name?: string | null };
};

/**
 * the reply to send discord, or undefined for an interaction we do not handle.
 *
 * pure on purpose: everything it needs is in the payload, so the route stays a
 * signature check and this stays testable without a request
 */
export function handleInteraction(interaction: Interaction) {
  if (interaction.type === PING) return { type: PONG };

  if (interaction.type === MESSAGE_COMPONENT) {
    const id = interaction.data?.custom_id;
    if (!id?.startsWith(POSTED_PREFIX)) return undefined;

    const components = interaction.message?.components;
    if (!components) return undefined;

    return {
      type: UPDATE_MESSAGE,
      data: {
        flags: IS_COMPONENTS_V2,
        components: markPosted(components, id, who(interaction)),
      },
    };
  }

  return undefined;
}

/** the display name to credit, preferring what a member chose to be called */
function who(interaction: Interaction): string {
  const user = interaction.member?.user ?? interaction.user;
  return user?.global_name || user?.username || "someone";
}

/**
 * the same components with one button spent.
 *
 * only the button whose custom_id matches changes, so a message listing five
 * articles keeps the other four pressable. the id has to go: a disabled button
 * still round-trips it, and leaving it invites a second press being handled
 */
function markPosted(
  components: Component[],
  id: string,
  name: string,
): Component[] {
  return components.map((component) => {
    if (!component.components) return component;

    return {
      ...component,
      components: component.components.map((child) => {
        if (child.type !== BUTTON || child.custom_id !== id) return child;

        const { custom_id, ...rest } = child;
        return {
          ...rest,
          style: SUCCESS_STYLE,
          label: `Posted by ${name}`.slice(0, MAX_LABEL),
          disabled: true,
        };
      }),
    };
  });
}

/*
  what happens when somebody presses a button on one of our messages, or runs
  one of our slash commands.

  a button press is one request and one reply, with nothing fetched in between:
  discord hands us the message the button belongs to and the member who pressed
  it, and we hand back the message with that button changed. that is why it
  needs no store — the message is the record of what has been posted — and why
  discord's three-second deadline is never in play for it.

  a command is not like that. anything that writes to notion will miss three
  seconds, so those answer DEFER and follow up; `deferEphemeral()` below is that
  seam. `/article ping` fetches nothing and answers inline
*/

import { EDITORIAL_BOARD_ROLE_ID } from "./config";

const IS_COMPONENTS_V2 = 1 << 15;

/**
 * an ephemeral reply: only the person who ran the command sees it, and it
 * disappears. every command reply is one — ADR 0009: the editor sees the
 * result, the channel sees nothing.
 *
 * discord takes both flags together, so a components v2 body has to carry the
 * v2 bit as well or discord rejects the response outright
 */
const EPHEMERAL = 64;
const EPHEMERAL_V2 = EPHEMERAL | IS_COMPONENTS_V2;

/** interaction types, of which we answer three */
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;

/** response types */
const PONG = 1;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;
const DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5;
const UPDATE_MESSAGE = 7;

const TEXT_DISPLAY = 10;

const BUTTON = 2;
const SUCCESS_STYLE = 3;
const DANGER_STYLE = 4;

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

type CommandOption = {
  name: string;
  value?: unknown;
  options?: CommandOption[];
};

type Interaction = {
  type: number;
  data?: { custom_id?: string; name?: string; options?: CommandOption[] };
  message?: { components?: Component[] };
  member?: {
    /** every role the member holds, which is the only access check we get */
    roles?: string[];
    user?: { username?: string; global_name?: string | null };
  };
  user?: { username?: string; global_name?: string | null };
};

/**
 * the reply to send discord, or undefined for an interaction we do not handle.
 *
 * pure on purpose: everything it needs is in the payload, so the route stays a
 * signature check and this stays testable without a request
 */
export type InteractionResponse = {
  type: number;
  /** absent on a pong, which is a bare acknowledgement */
  data?: { flags: number; components: Component[] };
};

export function handleInteraction(
  interaction: Interaction,
): InteractionResponse | undefined {
  if (interaction.type === PING) return { type: PONG };

  if (interaction.type === APPLICATION_COMMAND)
    return handleCommand(interaction);

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
 * an ephemeral message, in components v2 because everything else here is.
 *
 * both flags: the ephemeral bit alone with a `components` body is a response
 * discord refuses, which reaches the editor as "HareWare didn't respond in
 * time" — the same shape of failure a button missing its custom_id causes
 */
export function ephemeral(content: string) {
  const components: Component[] = [{ type: TEXT_DISPLAY, content }];

  return {
    type: CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: EPHEMERAL_V2, components },
  };
}

/**
 * "HareWare is thinking", and the seam every write path leaves through.
 *
 * discord kills an interaction that is not answered within three seconds, and
 * a notion read plus a PATCH does not fit — so a subcommand that writes returns
 * this, and the caller then does the work and PATCHes
 * `/webhooks/{application}/{token}/messages/@original` with the outcome.
 *
 * whatever does that work must say something on every path, including the ones
 * that fail. an interaction acknowledged and then left silent is exactly the
 * failure `docs/agents/silent-failures.md` is about: the editor sees a spinner
 * settle into nothing and has no way to tell a refused write from a slow one.
 *
 * no components: a deferred acknowledgement carries no body, so this takes the
 * plain ephemeral flag rather than the v2 pair
 */
export function deferEphemeral() {
  return {
    type: DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: EPHEMERAL },
  };
}

/** the subcommand discord was asked for: `/article ping` arrives as "ping" */
function subcommandOf(interaction: Interaction): string | undefined {
  return interaction.data?.options?.[0]?.name;
}

/*
  every subcommand, and what it answers with. one entry per property as ADR
  0009 fills this in; a subcommand that writes to notion returns
  `deferEphemeral()` here and follows up, rather than trying to fit a write
  inside three seconds
*/
const SUBCOMMANDS: Record<
  string,
  (interaction: Interaction) => ReturnType<typeof ephemeral>
> = {
  ping: (interaction) =>
    ephemeral(
      `HareWare is listening. Discord says you are **${who(interaction)}**.`,
    ),
};

/**
 * the reply to a slash command, which is always a reply.
 *
 * unlike a button press there is no "not ours to answer" branch: discord shows
 * an unanswered command as "HareWare didn't respond in time", so a command we
 * do not recognise gets a sentence saying so rather than silence
 */
function handleCommand(interaction: Interaction) {
  /*
    the command registers with default_member_permissions "0" — invisible until
    an admin grants it to a role under Server Settings → Integrations. that
    override is editable by any admin and says nothing about @Editorial Board,
    so it is a default and not a security boundary. this is the boundary.

    `member` is absent in a DM, where there are no roles to check, and absent
    has to refuse rather than read as an empty role list
  */
  const roles = interaction.member?.roles;
  if (!roles?.includes(EDITORIAL_BOARD_ROLE_ID)) {
    return ephemeral(
      "This command is for the Editorial Board, in the server. If you are on the board and seeing this, ask an admin to check the role.",
    );
  }

  const subcommand = subcommandOf(interaction);
  const run = subcommand ? SUBCOMMANDS[subcommand] : undefined;

  if (!run) {
    return ephemeral(
      `HareWare does not know the command \`/${interaction.data?.name ?? "?"}${subcommand ? ` ${subcommand}` : ""}\`. It may have been registered by an older deploy.`,
    );
  }

  return run(interaction);
}

/** the display name to credit, preferring what a member chose to be called */
function who(interaction: Interaction): string {
  const user = interaction.member?.user ?? interaction.user;
  return user?.global_name || user?.username || "someone";
}

/**
 * the same components with one button toggled.
 *
 * only the button whose custom_id matches changes, so a message listing five
 * articles keeps the other four alone. nothing is disabled: this is a checkbox
 * discord makes us draw as a button, and a checkbox that cannot be unticked is
 * a trap for whoever presses the wrong row.
 *
 * the custom_id stays. an interactive button — anything but a link — is invalid
 * without one, and discord rejects the entire response rather than the single
 * component, which surfaces to whoever pressed it as "HareWare didn't respond
 * in time"
 */
function togglePosted(
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

        /*
          the current state is read off the button itself rather than stored
          anywhere — green means it has been posted, so pressing it un-posts.
          un-posting drops the name with it; who posted something that is no
          longer posted is not a fact worth keeping
        */
        const posted = child.style === SUCCESS_STYLE;

        return posted
          ? { ...child, style: DANGER_STYLE, label: "Not posted" }
          : {
              ...child,
              style: SUCCESS_STYLE,
              label: `Posted by ${name}`.slice(0, MAX_LABEL),
            };
      }),
    };
  });
}

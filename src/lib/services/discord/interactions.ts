/*
  what happens when somebody presses a button on one of our messages, runs one
  of our slash commands, or types into one of their pickers.

  a button press is one request and one reply, with nothing fetched in between:
  discord hands us the message the button belongs to and the member who pressed
  it, and we hand back the message with that button changed. that is why it
  needs no store — the message is the record of what has been posted — and why
  discord's three-second deadline is never in play for it.

  a command is not like that. anything that writes to notion will miss three
  seconds, so those answer DEFER and follow up; `deferEphemeral()` below is that
  seam. `/article ping` fetches nothing and answers inline, and the two read
  commands fetch once and still answer inline.

  autocomplete is the one that cannot defer at all — there is no such response
  type — so its read is raced against a deadline and answers an empty dropdown
  rather than nothing. the reads themselves arrive as `deps`, which is what
  keeps this file testable without D1 or notion.
*/

import { card, type CardPage } from "~/lib/articles/card";
import { choicesFor, type AutocompleteChoice } from "~/lib/articles/pick";
import type { ArticleRow } from "~/lib/db/schema";
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

/** interaction types, of which we answer four */
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const APPLICATION_COMMAND_AUTOCOMPLETE = 4;

/** response types */
const PONG = 1;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;
const DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5;
const UPDATE_MESSAGE = 7;
const APPLICATION_COMMAND_AUTOCOMPLETE_RESULT = 8;

const TEXT_DISPLAY = 10;

const BUTTON = 2;
const SUCCESS_STYLE = 3;
const DANGER_STYLE = 4;

/** discord truncates nothing for us; a button label over 80 chars is rejected */
const MAX_LABEL = 80;

/**
 * how long the index gets to answer an autocomplete.
 *
 * discord's three seconds are hard and there is no deferred autocomplete
 * response, so a slow D1 read has to become an empty dropdown well before the
 * deadline rather than a "HareWare didn't respond in time" on every keystroke
 */
const AUTOCOMPLETE_BUDGET_MS = 2000;

/**
 * how many rows a short query pulls before it is narrowed to one editor's.
 *
 * wider than the 25 discord shows, because the narrowing happens after the
 * read and an editor's own articles are not necessarily the 25 most recently
 * edited in the club
 */
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

/**
 * an option as discord sends it back, which is not the option as we registered
 * it.
 *
 * the registration shape in `commands.ts` carries a description and the
 * choices we offer; what arrives carries the value the editor chose and, during
 * autocomplete, which option their cursor is in. they were one type, and that
 * is why `value` was `unknown` and every read of it went through `String()`
 */
type SubmittedOption = {
  name: string;
  /** discord sends the option's own type; ours are all strings */
  value?: string | number | boolean;
  /** which option the cursor is in; only autocomplete payloads carry it */
  focused?: boolean;
  options?: SubmittedOption[];
};

/**
 * an option's value as text.
 *
 * every option `/article` takes is a string, so anything else is discord
 * sending a shape we did not register — treated as absent rather than coerced,
 * because `String(someObject)` is how "[object Object]" reaches notion
 */
function textOf(option: SubmittedOption | undefined): string {
  return typeof option?.value === "string" ? option.value.trim() : "";
}

type Interaction = {
  type: number;
  data?: { custom_id?: string; name?: string; options?: SubmittedOption[] };
  message?: { components?: Component[] };
  member?: {
    /** every role the member holds, which is the only access check we get */
    roles?: string[];
    user?: { username?: string; global_name?: string | null };
  };
  user?: { username?: string; global_name?: string | null };
};

/**
 * the reads a command needs, as functions rather than an `Env`.
 *
 * the route supplies the real ones; a test hands over two closures. keeping
 * `D1Database` and the notion token out of this file is what lets every branch
 * below — including the ones that fail — be exercised without either
 */
export type InteractionDeps = {
  /** the index, most recently edited first — the matching happens in `pick` */
  index?: () => Promise<ArticleRow[]>;
  /** one Article, read live from notion — never from the index, per ADR 0009 */
  page?: (pageId: string) => Promise<CardPage>;
  /** overridable so a test can prove the deadline exists without waiting */
  timeoutMs?: number;
};

/** a reply carrying a message: everything but autocomplete */
export type MessageResponse = {
  type: number;
  /** absent on a pong, which is a bare acknowledgement */
  data?: { flags: number; components: Component[] };
};

/** the dropdown, which carries choices instead of a body and takes no flags */
export type AutocompleteResponse = {
  type: number;
  data: { choices: AutocompleteChoice[] };
};

/** the reply to send discord, or undefined for an interaction we do not handle */
export type InteractionResponse = MessageResponse | AutocompleteResponse;

export async function handleInteraction(
  interaction: Interaction,
  deps: InteractionDeps = {},
): Promise<InteractionResponse | undefined> {
  if (interaction.type === PING) return { type: PONG };

  if (interaction.type === APPLICATION_COMMAND)
    return handleCommand(interaction, deps);

  if (interaction.type === APPLICATION_COMMAND_AUTOCOMPLETE)
    return handleAutocomplete(interaction, deps);

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
export function ephemeral(content: string): MessageResponse {
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
 * nothing returns this yet: both read commands fetch once and fit inline, and
 * acknowledging a read we could simply answer would mean owning a follow-up
 * that can itself go quiet.
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
function subcommandOf(interaction: Interaction): SubmittedOption | undefined {
  return interaction.data?.options?.[0];
}

/** whether the member who sent this holds @Editorial Board */
function onTheBoard(interaction: Interaction): boolean {
  /*
    `member` is absent in a DM, where there are no roles to check, and absent
    has to refuse rather than read as an empty role list
  */
  return interaction.member?.roles?.includes(EDITORIAL_BOARD_ROLE_ID) ?? false;
}

/** one of a subcommand's own options, by name */
function optionOf(
  subcommand: SubmittedOption | undefined,
  name: string,
): SubmittedOption | undefined {
  return subcommand?.options?.find((option) => option.name === name);
}

/*
  every subcommand, and what it answers with. one entry per property as ADR
  0009 fills this in; a subcommand that writes to notion returns
  `deferEphemeral()` here and follows up, rather than trying to fit a write
  inside three seconds
*/
/**
 * the names this file answers to.
 *
 * exported so a test can hold it against the registration: a subcommand
 * implemented here but not registered is invisible, and one registered but not
 * implemented answers "HareWare does not know that command". both are silent
 * until somebody tries it — which is how `show` shipped working and
 * unreachable
 */
export const HANDLED = ["ping", "show"] as const;

const SUBCOMMANDS: Record<
  string,
  (
    interaction: Interaction,
    deps: InteractionDeps,
  ) => MessageResponse | Promise<MessageResponse>
> = {
  ping: (interaction) =>
    ephemeral(
      `HareWare is listening. Discord says you are **${who(interaction)}**.`,
    ),

  show: (interaction, deps) => show(interaction, deps),
};

/**
 * `/article show` — one Article, read live from notion.
 *
 * answered inline rather than through `deferEphemeral()`: one page read fits
 * inside three seconds comfortably, and an acknowledgement is a promise to
 * follow up that can itself go quiet. every branch here says something.
 */
async function show(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<MessageResponse> {
  const pageId = textOf(optionOf(subcommandOf(interaction), "article"));

  /*
    discord sends whatever was typed when nobody picked a suggestion, so this
    is as likely to be half a headline as a page id — either way it is not
    something to hand to notion
  */
  if (!pageId)
    return ephemeral("Pick an Article from the list HareWare offers.");

  if (!deps.page) return ephemeral("HareWare cannot reach Notion right now.");

  try {
    return ephemeral(card(await deps.page(pageId)));
  } catch (error) {
    console.error("[article] could not read a page for /article show", error);

    return ephemeral(
      "Notion did not answer, so HareWare cannot show that Article. Try again, or open it in Notion.",
    );
  }
}

/**
 * the reply to a slash command, which is always a reply.
 *
 * unlike a button press there is no "not ours to answer" branch: discord shows
 * an unanswered command as "HareWare didn't respond in time", so a command we
 * do not recognise gets a sentence saying so rather than silence
 */
async function handleCommand(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<MessageResponse> {
  /*
    the command registers with default_member_permissions "0" — invisible until
    an admin grants it to a role under Server Settings → Integrations. that
    override is editable by any admin and says nothing about @Editorial Board,
    so it is a default and not a security boundary. this is the boundary.
  */
  if (!onTheBoard(interaction)) {
    return ephemeral(
      "This command is for the Editorial Board, in the server. If you are on the board and seeing this, ask an admin to check the role.",
    );
  }

  const subcommand = subcommandOf(interaction)?.name;
  const run = subcommand ? SUBCOMMANDS[subcommand] : undefined;

  if (!run) {
    return ephemeral(
      `HareWare does not know the command \`/${interaction.data?.name ?? "?"}${subcommand ? ` ${subcommand}` : ""}\`. It may have been registered by an older deploy.`,
    );
  }

  return run(interaction, deps);
}

/**
 * the dropdown discord shows while an editor types.
 *
 * three things shape this. it cannot be deferred — there is no such response
 * type, and discord's three seconds are hard — so the read is raced against a
 * deadline and a slow index becomes an empty dropdown rather than an error.
 * it is gated on the role like every other branch, because an autocomplete
 * response is a list of the club's unpublished Articles and reaches whoever an
 * admin left the command visible to. and an empty list is always a valid
 * answer, so nothing here may throw.
 */
async function handleAutocomplete(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<AutocompleteResponse> {
  const empty = {
    type: APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices: [] },
  };

  /*
    the same check `handleCommand` makes, for the same reason: without it the
    picker lists every Article to anybody who can reach the command, and it
    does so before the command is ever run
  */
  if (!onTheBoard(interaction)) {
    console.warn("[article] autocomplete refused: not on the editorial board");
    return empty;
  }

  const subcommand = subcommandOf(interaction);
  const focused = subcommand?.options?.find((option) => option.focused);
  const query = textOf(focused);

  const index = deps.index;
  if (!index) {
    console.error("[article] autocomplete has no index to read");
    return empty;
  }

  /*
    two characters match most of the 138 rows, so a short query is not a search
    worth running — the useful answer to a picker that has only just opened is
    the editor's own most recent work
  */
  const { rows, why } = await within(
    index(),
    deps.timeoutMs ?? AUTOCOMPLETE_BUDGET_MS,
  );

  /*
    ranked here rather than in sql: 139 rows are nothing to read whole, and it
    buys a fuzzy match plus a ranking that puts the articles being worked on
    now at the top — which is what an editor opening the picker wants, and
    exactly what an empty query returns
  */
  const choices = choicesFor(rows, query);

  /*
    every failure here answers with an empty list, because that is the only
    thing discord accepts — which leaves an editor staring at a blank dropdown
    with nothing anywhere saying why. this line is the difference between that
    and a question somebody can answer
  */
  if (choices.length === 0) {
    console.warn(
      `[article] autocomplete answered nothing: query=${JSON.stringify(query)} rows=${rows.length} ${why ?? "no matches"}`,
    );
  }

  return {
    type: APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices },
  };
}

/**
 * the rows, or none of them if they take too long or the read throws.
 *
 * `store.search` already swallows its own D1 failures, and this is the second
 * half of that bargain: a promise that never settles is the failure it cannot
 * catch, and it is the one discord punishes
 */
async function within(rows: Promise<ArticleRow[]>, ms: number) {
  /* a sentinel rather than an empty array: "the deadline won" and "the index
     holds nothing that matches" are different facts, and answering both with
     `[]` is what made an empty dropdown impossible to explain */
  const LATE = Symbol("late");
  const deadline = new Promise<typeof LATE>((resolve) =>
    setTimeout(() => resolve(LATE), ms),
  );

  try {
    const raced = await Promise.race([rows, deadline]);
    if (raced === LATE) return { rows: [], why: "timed out" as const };

    return { rows: raced, why: undefined };
  } catch (error) {
    console.error("[article] could not read the index for autocomplete", error);
    return { rows: [], why: "threw" as const };
  }
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

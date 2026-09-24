/*
  Routes verified Discord interactions: button presses, slash commands and
  autocomplete. Writes miss Discord's three seconds, so they DEFER and follow
  up; autocomplete cannot defer, so its read races a deadline. ADR 0009.
*/

import { articleResponse, editResponse } from "./article-response";
import {
  IS_COMPONENTS_V2,
  markup,
  type CommandMessage,
  type Component,
  type Markup,
} from "./message";
import type {
  Actor,
  EditRequest,
  EditResult,
  PickedUser,
} from "~/lib/articles/edit";
import { suggestions } from "./article-picker";
import type { Intent } from "~/lib/articles/write";
import {
  isArticle,
  pageIdOf,
  type Article,
  type ArticlePage,
} from "~/lib/articles/page";
import type { Result } from "~/lib/result";
import { EDITORIAL_BOARD_ROLE_ID } from "./config";
import { followUp } from "./follow-up";
import {
  deferEphemeral,
  ephemeral,
  type AutocompleteResponse,
  type InteractionResponse,
  type MessageResponse,
} from "./interaction-response";
import { POSTED_PREFIX, togglePosted } from "./posted-button";

/** interaction types */
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const APPLICATION_COMMAND_AUTOCOMPLETE = 4;

/** response types */
const PONG = 1;
const UPDATE_MESSAGE = 7;
const APPLICATION_COMMAND_AUTOCOMPLETE_RESULT = 8;

/**
 * Autocomplete's budget, under Discord's hard three seconds: a slow read
 * becomes an empty dropdown.
 */
const AUTOCOMPLETE_BUDGET_MS = 2000;

/**
 * below this a substring search matches most of the corpus, so it is not run
 */
const MIN_SEARCH = 2;

/** an option as Discord sends it back, not as `commands.ts` registers it */
type SubmittedOption = {
  name: string;
  value?: string | number | boolean;
  /** which option the cursor is in; only autocomplete payloads carry it */
  focused?: boolean;
  options?: SubmittedOption[];
};

/**
 * An option's value as text. Anything but a string is treated as absent, not
 * coerced.
 */
function textOf(option: SubmittedOption | undefined): string {
  return typeof option?.value === "string" ? option.value.trim() : "";
}

type DiscordUser = {
  id?: string;
  username?: string;
  global_name?: string | null;
};

type Interaction = {
  type: number;
  /** the two halves of the follow-up url; only a deferred reply needs them */
  application_id?: string;
  token?: string;
  data?: {
    custom_id?: string;
    name?: string;
    options?: SubmittedOption[];
    /* the objects behind a USER option, so crediting needs no lookup */
    resolved?: {
      members?: Record<string, { nick?: string | null }>;
      users?: Record<string, DiscordUser>;
    };
  };
  message?: { components?: Component[] };
  member?: {
    roles?: string[];
    nick?: string | null;
    user?: DiscordUser;
  };
  user?: DiscordUser;
};

/**
 * what a command reads and writes, supplied by the route so tests need no
 * Notion
 */
export type InteractionDeps = {
  /** the most recently edited Articles */
  articles?: () => Promise<Article[]>;
  /**
   * headlines containing this text, for work too old to be in the recent set
   */
  search?: (text: string) => Promise<Article[]>;
  /** one Article, read live from notion */
  page?: (pageId: string) => Promise<ArticlePage>;
  /** the write, after the reply. `runEdit`, which never throws */
  edit?: (request: EditRequest, actor: Actor) => Promise<EditResult>;
  /**
   * `waitUntil`. Without it the isolate can be torn down once DEFER returns, so
   * its absence refuses the command rather than deferring into nothing.
   */
  defer?: (work: () => Promise<void>) => void;
  reply?: typeof followUp;
  timeoutMs?: number;
};

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

function subcommandOf(interaction: Interaction): SubmittedOption | undefined {
  return interaction.data?.options?.[0];
}

/**
 * whether the sender holds @Editorial Board. A DM has no `member`, and refuses.
 */
function onTheBoard(interaction: Interaction): boolean {
  return interaction.member?.roles?.includes(EDITORIAL_BOARD_ROLE_ID) ?? false;
}

function optionOf(
  subcommand: SubmittedOption | undefined,
  name: string,
): SubmittedOption | undefined {
  return subcommand?.options?.find((option) => option.name === name);
}

const SUBCOMMANDS: Record<
  string,
  (
    interaction: Interaction,
    deps: InteractionDeps,
  ) => MessageResponse | Promise<MessageResponse>
> = {
  ping: (interaction) =>
    ephemeral(
      markup`HareWare is listening. Discord says you are **${who(interaction)}**.`,
    ),

  show: (interaction, deps) => show(interaction, deps),

  new: (interaction, deps) =>
    write(interaction, deps, (subcommand) => {
      const headline = textOf(optionOf(subcommand, "headline"));
      if (!headline) return refuse(markup`Give the article a headline.`);
      const member = picked(interaction, subcommand, "member");
      if (!member)
        return refuse(markup`Choose the Discord member writing the article.`);
      const section = textOf(optionOf(subcommand, "section"));
      if (!section)
        return refuse(markup`Choose the section responsible for the article.`);

      return {
        request: {
          kind: "create",
          headline,
          section,
          member,
          /* a pseudonym; without one the member's name is printed (ADR 0004) */
          byline: textOf(optionOf(subcommand, "byline")) || null,
        },
      };
    }),

  headline: (interaction, deps) =>
    write(interaction, deps, (subcommand) => {
      const text = textOf(optionOf(subcommand, "headline"));
      if (!text) return refuse(markup`Give the article a headline.`);

      return property(subcommand, { property: "headline", text });
    }),

  status: (interaction, deps) =>
    write(interaction, deps, (subcommand) =>
      chosen(subcommand, "status", "status"),
    ),

  "image-status": (interaction, deps) =>
    write(interaction, deps, (subcommand) =>
      chosen(subcommand, "image-status", "imageStatus"),
    ),

  section: (interaction, deps) =>
    write(interaction, deps, (subcommand) =>
      chosen(subcommand, "section", "section"),
    ),

  "publication-date": (interaction, deps) =>
    write(interaction, deps, (subcommand) => {
      const typed = textOf(optionOf(subcommand, "date"));

      /* No date clears it. A malformed one is refused here: Notion silently
         ignores it on some property types. */
      if (typed && !isDate(typed))
        return refuse(
          markup`**${typed}** is not a date HareWare can write. Use \`YYYY-MM-DD\`, or leave the date out to clear it.`,
        );

      return property(subcommand, {
        property: "publicationDate",
        date: typed || null,
      });
    }),

  author: (interaction, deps) =>
    write(interaction, deps, (subcommand) =>
      crediting(interaction, subcommand, "author"),
    ),

  "image-crew": (interaction, deps) =>
    write(interaction, deps, (subcommand) =>
      crediting(interaction, subcommand, "image"),
    ),

  delete: (interaction, deps) =>
    write(interaction, deps, (subcommand) => {
      const pageId = articleOf(subcommand);
      return pageId ? { request: { kind: "delete", pageId } } : UNPICKED;
    }),
};

/**
 * the subcommands handled here; `commands.test.ts` holds the registration to it
 */
export const HANDLED = Object.keys(SUBCOMMANDS);

/* ---- turning an interaction into a request ------------------------------ */

/** a request, or why there is none — answered inline, before deferring */
type Parsed = { request: EditRequest } | { refusal: Markup };

const refuse = (reason: Markup): Parsed => ({ refusal: reason });

const PICK_AN_ARTICLE = markup`Pick an Article from the list HareWare offers.`;
const UNPICKED = refuse(PICK_AN_ARTICLE);

/**
 * The picked page id, or null. Discord sends typed text when nothing was
 * picked, and that must not reach Notion.
 */
function articleOf(subcommand: SubmittedOption | undefined): string | null {
  return pageIdOf(textOf(optionOf(subcommand, "article")));
}

function property(
  subcommand: SubmittedOption | undefined,
  intent: Intent,
): Parsed {
  const pageId = articleOf(subcommand);
  if (!pageId) return UNPICKED;

  return { request: { kind: "property", pageId, intent } };
}

/** one of the three pickers whose options came from notion's own schema */
function chosen(
  subcommand: SubmittedOption | undefined,
  option: string,
  key: "status" | "imageStatus" | "section",
): Parsed {
  const picked = textOf(optionOf(subcommand, option));
  const label = option.replace("-", " ");
  if (!picked)
    return refuse(
      markup`Pick ${/^[aeiou]/.test(label) ? "an" : "a"} ${label}.`,
    );

  return key === "section"
    ? property(subcommand, { property: "section", option: picked })
    : property(subcommand, { property: key, option: picked });
}

function crediting(
  interaction: Interaction,
  subcommand: SubmittedOption | undefined,
  credit: "author" | "image",
): Parsed {
  const pageId = articleOf(subcommand);
  if (!pageId) return UNPICKED;
  const member = picked(interaction, subcommand, "member");
  if (!member)
    return refuse(markup`Choose the Discord member behind this credit.`);

  return {
    request: {
      kind: "credit",
      pageId,
      credit,
      member,
      byline: textOf(optionOf(subcommand, "byline")) || null,
      also: optionOf(subcommand, "also")?.value === true,
    },
  };
}

/**
 * the picked user, named as `~/lib/member` names them: nickname, display name,
 * handle
 */
function picked(
  interaction: Interaction,
  subcommand: SubmittedOption | undefined,
  name: string,
): PickedUser | null {
  const discordId = textOf(optionOf(subcommand, name));
  if (!discordId) return null;

  const resolved = interaction.data?.resolved;
  const user = resolved?.users?.[discordId];
  const displayName =
    resolved?.members?.[discordId]?.nick ||
    user?.global_name ||
    user?.username ||
    "";

  return { discordId, displayName };
}

/** a real YYYY-MM-DD date. `new Date` would roll 2026-02-31 into March. */
function isDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  const [year, month, day] = text.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/* ---- deferring ---------------------------------------------------------- */

/**
 * Parse, DEFER, write, follow up. Once deferred, every path must end in a
 * follow-up or a logged reason: a silent deferral leaves the editor a spinner
 * (docs/agents/silent-failures.md).
 */
function write(
  interaction: Interaction,
  deps: InteractionDeps,
  parse: (subcommand: SubmittedOption | undefined) => Parsed,
): MessageResponse {
  const parsed = parse(subcommandOf(interaction));
  if ("refusal" in parsed) return ephemeral(parsed.refusal);

  const { edit, defer } = deps;

  if (!edit || !defer)
    return ephemeral(
      markup`HareWare cannot write to Notion right now — it is missing the credentials or the runtime to do it with. Nothing was changed.`,
    );

  const applicationId = interaction.application_id ?? "";
  const token = interaction.token ?? "";
  const send = deps.reply ?? followUp;
  const actor: Actor = {
    id: interaction.member?.user?.id ?? interaction.user?.id ?? "",
    name: who(interaction),
  };

  defer(async () => {
    let message: CommandMessage;

    try {
      message = editResponse(await edit(parsed.request, actor));
    } catch (error) {
      console.error("[article] an edit threw rather than answering", error);
      message = editResponse({
        status: "failed",
        explanation:
          "HareWare could not confirm the edit. Check the Article in Notion and /log.",
        notes: [],
        ...(parsed.request.kind !== "create"
          ? { pageId: parsed.request.pageId }
          : {}),
      });
    }

    const result: Result = await send(applicationId, token, message);

    if (result.outcome !== "ok")
      console.error(`[article] could not answer the editor: ${result.summary}`);
  });

  return deferEphemeral();
}

/** `/article show`, answered inline: one page read fits in three seconds */
async function show(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<MessageResponse> {
  const pageId = articleOf(subcommandOf(interaction));
  if (!pageId) return ephemeral(PICK_AN_ARTICLE);

  if (!deps.page)
    return ephemeral(markup`HareWare cannot reach Notion right now.`);

  let page: ArticlePage;
  try {
    page = await deps.page(pageId);
  } catch (error) {
    console.error("[article] could not read a page for /article show", error);

    return ephemeral(
      markup`Notion did not answer, so HareWare cannot show that Article. Try again, or open it in Notion.`,
    );
  }

  return ephemeral(
    isArticle(page)
      ? articleResponse(page)
      : markup`That is not a page in Articles.`,
  );
}

/**
 * always a reply: an unanswered command reads as "HareWare didn't respond in
 * time"
 */
async function handleCommand(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<MessageResponse> {
  /* The access check. `default_member_permissions` is editable by any admin,
     so it is only a default. */
  if (!onTheBoard(interaction)) {
    return ephemeral(
      markup`This command is for the Editorial Board, in the server. If you are on the board and seeing this, ask an admin to check the role.`,
    );
  }

  const subcommand = subcommandOf(interaction)?.name;
  const run = subcommand ? SUBCOMMANDS[subcommand] : undefined;

  if (!run) {
    const name = `/${interaction.data?.name ?? "?"}${subcommand ? ` ${subcommand}` : ""}`;
    return ephemeral(
      markup`HareWare does not know the command **${name}**. It may have been registered by an older deploy.`,
    );
  }

  return run(interaction, deps);
}

/** Never throws: an empty list is always a valid answer. */
async function handleAutocomplete(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<AutocompleteResponse> {
  const empty = {
    type: APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices: [] },
  };

  /* the list is the club's unpublished Articles */
  if (!onTheBoard(interaction)) {
    console.warn("[article] autocomplete refused: not on the editorial board");
    return empty;
  }

  const subcommand = subcommandOf(interaction);
  const focused = subcommand?.options?.find((option) => option.focused);
  const query = textOf(focused);

  const articles = deps.articles;
  if (!articles) {
    console.error("[article] autocomplete has nowhere to read Articles from");
    return empty;
  }

  /* one deadline shared by both reads, so together they stay under three
     seconds */
  const until = Date.now() + (deps.timeoutMs ?? AUTOCOMPLETE_BUDGET_MS);
  const left = () => Math.max(0, until - Date.now());

  const recent = await within(articles(), left());

  let choices = suggestions(recent.rows, query);
  let source = "recent";
  let why = recent.why;

  /* Older work, by Notion's literal substring match. Not after a read that
     failed: that would ask Notion again while it is refusing us. */
  if (
    choices.length === 0 &&
    recent.why === undefined &&
    query.length >= MIN_SEARCH &&
    deps.search
  ) {
    const found = await within(deps.search(query), left());

    choices = suggestions(found.rows, query);
    source = "search";
    why = found.why;
  }

  /* every failure answers an empty list; this is the only record of why */
  if (choices.length === 0) {
    console.warn(
      `[article] autocomplete answered nothing: query=${JSON.stringify(query)} source=${source} ${why ?? "no matches"}`,
    );
  }

  return {
    type: APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices },
  };
}

/** the rows, or none with the reason: too slow, or threw */
async function within(rows: Promise<Article[]>, ms: number) {
  const LATE = Symbol("late");
  const deadline = new Promise<typeof LATE>((resolve) =>
    setTimeout(() => resolve(LATE), ms),
  );

  try {
    const raced = await Promise.race([rows, deadline]);
    if (raced === LATE) return { rows: [], why: "timed out" as const };

    return { rows: raced, why: undefined };
  } catch (error) {
    console.error("[article] could not read articles for autocomplete", error);
    return { rows: [], why: "threw" as const };
  }
}

/** the display name to credit, preferring what a member chose to be called */
function who(interaction: Interaction): string {
  const user = interaction.member?.user ?? interaction.user;
  return (
    interaction.member?.nick || user?.global_name || user?.username || "someone"
  );
}

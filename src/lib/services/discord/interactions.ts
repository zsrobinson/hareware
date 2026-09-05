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
import type { Actor, EditRequest, PickedUser } from "~/lib/articles/edit";
import { suggestions, type AutocompleteChoice } from "~/lib/articles/pick";
import type { Intent } from "~/lib/articles/write";
import type { Article } from "~/lib/articles/page";
import type { Result } from "~/lib/result";
import { EDITORIAL_BOARD_ROLE_ID } from "./config";
import { followUp } from "./follow-up";

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
 * how long the whole autocomplete answer gets.
 *
 * discord's three seconds are hard and there is no deferred autocomplete
 * response, so a slow D1 read has to become an empty dropdown well before the
 * deadline rather than a "HareWare didn't respond in time" on every keystroke
 */
const AUTOCOMPLETE_BUDGET_MS = 2000;

/** below this a substring search matches most of the corpus, so it is not run */
const MIN_SEARCH = 2;

/** the prefix on every custom_id this file put on a message */
export const POSTED_PREFIX = "posted:";

/** a custom_id must be unique within a message and at most 100 characters */
export function postedId(slug: string) {
  return `${POSTED_PREFIX}${slug}`.slice(0, 100);
}

export type Component = {
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

/** a discord user, as much of one as a payload ever carries */
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
    /*
      the objects behind a USER option, sent with the interaction rather than
      looked up. `members` carries the server nickname and `users` the account,
      which is why crediting somebody costs no discord request at all
    */
    resolved?: {
      members?: Record<string, { nick?: string | null }>;
      users?: Record<string, DiscordUser>;
    };
  };
  message?: { components?: Component[] };
  member?: {
    /** every role the member holds, which is the only access check we get */
    roles?: string[];
    user?: DiscordUser;
  };
  user?: DiscordUser;
};

/**
 * the reads a command needs, as functions rather than an `Env`.
 *
 * the route supplies the real ones; a test hands over two closures. keeping
 * `D1Database` and the notion token out of this file is what lets every branch
 * below — including the ones that fail — be exercised without either
 */
export type InteractionDeps = {
  /** the most recently edited Articles — the matching happens in `pick` */
  articles?: () => Promise<Article[]>;
  /** headlines containing this text, for work too old to be in the recent set */
  search?: (text: string) => Promise<Article[]>;
  /** one Article, read live from notion */
  page?: (pageId: string) => Promise<CardPage>;
  /**
   * the write, which happens after the reply.
   *
   * it never throws and it always returns words: `runEdit` in
   * `~/lib/articles/edit` is that promise, and this seam is what lets every
   * branch of the deferral be exercised without notion
   */
  edit?: (request: EditRequest, actor: Actor) => Promise<string>;
  /**
   * hands work to the platform to finish after the response goes out.
   *
   * the route passes `(work) => locals.cfContext.waitUntil(work())`. without
   * it a worker is free to tear the isolate down the moment DEFER is returned,
   * which is the write that lands sometimes — so its absence refuses the
   * command outright rather than deferring into nothing
   */
  defer?: (work: () => Promise<void>) => void;
  /** overridable so a test can watch the follow-up without reaching discord */
  reply?: typeof followUp;
  /** overridable so a test can prove the deadline exists without waiting */
  timeoutMs?: number;
};

/** a reply carrying a message: everything but autocomplete */
export type MessageResponse = {
  type: number;
  /** absent on a pong, which is a bare acknowledgement */
  data?: {
    flags: number;
    /** absent on a deferral, which carries no body at all */
    components?: Component[];
  };
};

/**
 * a reply that carries a body, which is every reply but a deferral and a pong.
 *
 * the distinction is real rather than a convenience: discord rejects a
 * deferred response that carries `components`, and rejects a message response
 * that does not
 */
export type BodyResponse = MessageResponse & {
  data: { flags: number; components: Component[] };
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
export function ephemeral(content: string): BodyResponse {
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

  new: (interaction, deps) =>
    write(interaction, deps, (subcommand) => {
      const headline = textOf(optionOf(subcommand, "headline"));
      if (!headline) return refuse("Give the Article a Headline.");

      return {
        request: {
          kind: "create",
          headline,
          section: textOf(optionOf(subcommand, "section")) || null,
          member: picked(interaction, subcommand, "member"),
          /* ADR 0004: the printed Byline is always filled. the fallback —
             the member's name, else the caller's — belongs to `edit.ts`,
             which is the half that knows who the picked member turned out
             to be */
          byline: textOf(optionOf(subcommand, "byline")) || null,
        },
      };
    }),

  headline: (interaction, deps) =>
    write(interaction, deps, (subcommand) => {
      const text = textOf(optionOf(subcommand, "headline"));
      if (!text) return refuse("Give the Article a Headline.");

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

      /*
        no date clears it, deliberately: an Article that slipped out of the
        schedule has no Publication Date, and making an editor open notion to
        express that is the context switch these commands exist to remove.
        anything that is not a date is refused rather than sent — notion
        accepts a malformed string on some property types by ignoring it
      */
      if (typed && !isDate(typed))
        return refuse(
          `\`${typed}\` is not a date HareWare can write. Use YYYY-MM-DD, or leave the date out to clear it.`,
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
};

/**
 * the names this file answers to, read off the table above.
 *
 * a hand-written list here was a third copy of one fact: `commands.test.ts`
 * held it against the registration, and nothing held it against the handlers —
 * so a subcommand could be registered, listed, and still answer "HareWare does
 * not know that command". derived, the two lists cannot disagree, and the test
 * is comparing the registration against what actually runs.
 */
export const HANDLED = Object.keys(SUBCOMMANDS);

/* ---- turning an interaction into a request ------------------------------ */

/**
 * a request, or the sentence explaining why there is not one.
 *
 * refusal is a state rather than a thrown error, because every one of these is
 * answerable *before* deferring — and a command answered inline never leaves a
 * spinner behind
 */
type Parsed = { request: EditRequest } | { refusal: string };

const refuse = (reason: string): Parsed => ({ refusal: reason });

/** a one-property change against whichever Article was picked */
function property(
  subcommand: SubmittedOption | undefined,
  intent: Intent,
): Parsed {
  const pageId = textOf(optionOf(subcommand, "article"));

  /* discord sends whatever was typed when nobody picked a suggestion, so this
     is as likely to be half a headline as a page id */
  if (!pageId) return refuse("Pick an Article from the list HareWare offers.");

  return { request: { kind: "property", pageId, intent } };
}

/** one of the three pickers whose options came from notion's own schema */
function chosen(
  subcommand: SubmittedOption | undefined,
  option: string,
  key: "status" | "imageStatus" | "section",
): Parsed {
  const picked = textOf(optionOf(subcommand, option));
  if (!picked) return refuse(`Pick a ${option.replace("-", " ")}.`);

  /*
    the value is notion's own spelling because that is what was registered as
    the choice — this is the point of reading them from the schema rather than
    writing them down, and it is why `Not started` cannot become `Not Started`
  */
  return key === "section"
    ? property(subcommand, { property: "section", option: picked })
    : property(subcommand, { property: key, option: picked });
}

function crediting(
  interaction: Interaction,
  subcommand: SubmittedOption | undefined,
  credit: "author" | "image",
): Parsed {
  const pageId = textOf(optionOf(subcommand, "article"));
  if (!pageId) return refuse("Pick an Article from the list HareWare offers.");

  return {
    request: {
      kind: "credit",
      pageId,
      credit,
      member: picked(interaction, subcommand, "member"),
      byline: textOf(optionOf(subcommand, "byline")) || null,
      also: optionOf(subcommand, "also")?.value === true,
    },
  };
}

/**
 * whoever the user picker returned, name and all.
 *
 * the name comes out of `data.resolved` rather than a lookup, and prefers what
 * the member chose to be called in this server — nickname, then display name,
 * then handle — which is the same chain `~/lib/member` uses, so a person is
 * called one thing everywhere HareWare mentions them
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

/** a real calendar date, in the one format notion writes a bare date in */
function isDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  /* the shape is not enough: 2026-02-31 matches it and notion rejects it, and
     `new Date` rolls it forward to march rather than refusing */
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
 * DEFER now, write later, and say something either way.
 *
 * a notion read plus a PATCH does not fit inside discord's three seconds, so
 * every subcommand that writes comes through here. the shape is the whole
 * point: the request is parsed *before* deferring, so a bad date is answered
 * inline; and once deferred, every path — a refused write, a thrown edit, a
 * follow-up discord rejected — ends in a request to the follow-up url or a
 * line in the console saying why it could not. a deferred interaction left
 * silent is the failure `docs/agents/silent-failures.md` exists for: the
 * editor watches a spinner settle into nothing and cannot tell a refused write
 * from a slow one
 */
function write(
  interaction: Interaction,
  deps: InteractionDeps,
  parse: (subcommand: SubmittedOption | undefined) => Parsed,
): MessageResponse {
  const parsed = parse(subcommandOf(interaction));
  if ("refusal" in parsed) return ephemeral(parsed.refusal);

  const { edit, defer } = deps;

  /*
    refused inline rather than deferred. without somewhere to hand the work,
    deferring would answer "HareWare is thinking…" and then stop existing
  */
  if (!edit || !defer)
    return ephemeral(
      "HareWare cannot write to Notion right now — it is missing the credentials or the runtime to do it with. Nothing was changed.",
    );

  const applicationId = interaction.application_id ?? "";
  const token = interaction.token ?? "";
  const send = deps.reply ?? followUp;
  const actor: Actor = {
    id: interaction.member?.user?.id ?? interaction.user?.id ?? "",
    name: who(interaction),
  };

  defer(async () => {
    let content: string;

    try {
      content = await edit(parsed.request, actor);
    } catch (error) {
      /* `runEdit` promises not to throw, and this is what happens when that
         promise is broken — the editor still gets a sentence */
      console.error("[article] an edit threw rather than answering", error);
      content =
        "HareWare hit an error it did not expect and may not have written anything. Check the Article in Notion, and `/admin/log`.";
    }

    const result: Result = await send(applicationId, token, content);

    /* the write landing and the reply arriving are different mornings: a
       follow-up discord refused leaves an editor believing nothing happened */
    if (result.outcome !== "ok")
      console.error(`[article] could not answer the editor: ${result.summary}`);
  });

  return deferEphemeral();
}

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
 * deadline and a slow notion becomes an empty dropdown rather than an error.
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

  const articles = deps.articles;
  if (!articles) {
    console.error("[article] autocomplete has nowhere to read Articles from");
    return empty;
  }

  /*
    the hundred most recently edited, ranked here rather than by notion —
    notion cannot express a fuzzy match, and this is the whole reason an editor
    can type half a headline badly and still find it
  */
  /*
    one deadline for the whole answer, not one per read. the two reads used to
    get the full budget each, so a throttling notion spent two seconds on the
    first and two on the second — four against discord's hard three, which
    reaches the editor as "HareWare didn't respond in time" on every keystroke.
    exactly what the budget was chosen to prevent
  */
  const until = Date.now() + (deps.timeoutMs ?? AUTOCOMPLETE_BUDGET_MS);
  const left = () => Math.max(0, until - Date.now());

  const recent = await within(articles(), left());

  let choices = suggestions(recent.rows, query);
  let source = "recent";
  let why = recent.why;

  /*
    nothing recent matched, so it is probably older than the hundred we hold.
    notion's `contains` is a literal substring — it finds "ellicott" and not
    "elicott" — so this is coarser than the matching above and deliberately a
    last resort.

    `recent.why === undefined` is load-bearing: without it, a read that timed
    out or threw also arrives here as "no choices", and we would spend a second
    request on notion at the exact moment notion is refusing us
  */
  if (
    choices.length === 0 &&
    recent.why === undefined &&
    query.length >= MIN_SEARCH &&
    deps.search
  ) {
    const found = await within(deps.search(query), left());

    choices = suggestions(found.rows, query);
    source = "search";
    /* the search's own outcome, not the first read's — reporting "no matches"
       for a search that never answered is the failure this line exists to
       describe */
    why = found.why;
  }

  /*
    every failure here answers with an empty list, because that is the only
    thing discord accepts — which leaves an editor staring at a blank dropdown
    with nothing anywhere saying why. this line is the difference between that
    and a question somebody can answer
  */
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

/**
 * the rows, or none of them if they take too long or the read throws.
 *
 * `live.ts` deliberately lets its throws out — it has no better answer to
 * give — so this is where they stop. a promise that never settles is the
 * failure a try/catch cannot see, and it is the one discord punishes
 */
async function within(rows: Promise<Article[]>, ms: number) {
  /* a sentinel rather than an empty array: "the deadline won" and "notion
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
    console.error("[article] could not read articles for autocomplete", error);
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

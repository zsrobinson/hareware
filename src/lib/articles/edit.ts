/*
  running one editor's change all the way through: read notion, plan it, write
  it, index it, log it, and say what happened.

  this is the half of a slash command that does not fit inside discord's three
  seconds. `interactions.ts` turns an interaction into an `EditRequest` and
  defers; this takes it from there and hands back the sentence the follow-up
  sends. ADR 0009 has the shape.

  three rules the whole file is built around.

  **it never throws.** an editor is watching a spinner, and whatever goes wrong
  has to arrive as words. every path below ends in a returned string, which is
  what the caller PATCHes over "HareWare is thinking…".

  **it reads the page live, first.** the reply and the log say what the value
  changed *from*, which is what makes a command run against the wrong article
  undoable rather than a mystery. the index is never read for this — ADR 0009
  keeps it serving autocomplete and nothing else.

  **it refuses rather than guesses.** a relation notion is not sharing, two
  Members carrying one discord id, two rows answering to one name: each is
  refused out loud, because writing through any of them destroys something
  nobody can see.

  everything outside — notion, D1, the log — arrives as `EditIO`, so every
  branch here, including the ones that fail, is reachable from a test with no
  bindings and no token.
*/

import { failed, ok, type Result } from "~/lib/automations/registry";
import { record } from "~/lib/log";
import { assertProperties, optionNamed, type Schema } from "./choices";
import { ARTICLE_PROPERTIES, ARTICLES_DATA_SOURCE_ID } from "./config";
import {
  createMember,
  linkMember,
  resolveMember,
  type LinkPatch,
  type Member,
  type MemberMatch,
} from "./member";
import { upsert } from "./store";
import { relationIds, toEntry, type ArticlePage } from "./sync";
import {
  plan,
  planCreate,
  planCredit,
  type Intent,
  type PatchBody,
  type PlanResult,
} from "./write";
import { notion } from "~/lib/services/notion/client";

/** the discord user who ran the command */
export type Actor = { id: string; name: string };

/** the user discord's own picker handed back, resolved from the payload */
export type PickedUser = { discordId: string; displayName: string };

/**
 * one thing an editor asked for.
 *
 * three kinds rather than one per subcommand: eight subcommands share three
 * behaviours, and the differences between `status` and `section` are already
 * expressed by `Intent` in `write.ts`
 */
export type EditRequest =
  /** `/article new` */
  | { kind: "create"; headline: string; section: string | null; byline: string }
  /** every subcommand that sets one property */
  | { kind: "property"; pageId: string; intent: Intent }
  /** `/article author` and `/article image-crew`, which write a pair */
  | {
      kind: "credit";
      pageId: string;
      credit: "author" | "image";
      /** whoever the discord picker returned, or null when only text changed */
      member: PickedUser | null;
      /** the printed name, when the editor typed one */
      byline: string | null;
      /** add to the credit that is there rather than replacing it */
      also: boolean;
    };

/**
 * everything outside this module, as functions.
 *
 * `notionIO(env)` builds the real ones. a test hands over closures, which is
 * the only way the refusals below get exercised — they are the paths that
 * matter and the ones no integration test would reach on purpose
 */
export type EditIO = {
  /** the Articles schema, which is the data-loss guard's evidence */
  schema: () => Promise<Schema>;
  /** one Article, live. never the index */
  page: (pageId: string) => Promise<ArticlePage>;
  /** notion answers a PATCH with the whole updated page */
  patch: (pageId: string, body: PatchBody) => Promise<ArticlePage>;
  create: (body: PatchBody) => Promise<ArticlePage>;
  members: (discordId: string, displayName: string) => Promise<MemberMatch>;
  link: (memberPageId: string, patch: LinkPatch) => Promise<void>;
  addMember: (name: string, discordId: string) => Promise<Member>;
  /** the write-through, authoritative — the page came back from our own PATCH */
  index: (page: ArticlePage) => Promise<void>;
  log: (result: Result, actor: Actor) => Promise<void>;
};

/** what an editor is told when nothing else fits */
const UNSAID = "HareWare finished but could not say what it did.";

/**
 * one edit, start to finish. the sentence it returns is what discord shows.
 *
 * the log row is written here rather than by the caller because this is the
 * only place that knows both the outcome and what the value was before it —
 * ADR 0009 makes every mutation an Invocation, and a row carrying only the new
 * value cannot undo anything
 */
export async function runEdit(
  io: EditIO,
  request: EditRequest,
  actor: Actor,
): Promise<string> {
  const result = await attempt(io, request, actor);

  await io.log(result, actor);

  return result.summary || UNSAID;
}

async function attempt(
  io: EditIO,
  request: EditRequest,
  actor: Actor,
): Promise<Result> {
  let schema: Schema;
  try {
    schema = await io.schema();
  } catch (error) {
    return failed(`Notion did not answer with its schema: ${String(error)}`);
  }

  try {
    if (request.kind === "create") return await create(io, schema, request);

    const page = await io.page(request.pageId);

    if (request.kind === "property")
      return await apply(io, page, plan(schema, page, request.intent));

    return await credit(io, schema, page, request, actor);
  } catch (error) {
    /*
      one catch for every notion call: they all fail the same way from an
      editor's side, and the alternative — a rejected promise inside a
      `waitUntil` — is the spinner that never settles
    */
    console.error("[article] an edit did not complete", error);
    return failed(`Notion refused that: ${String(error)}`);
  }
}

/* ---- the three behaviours ----------------------------------------------- */

async function create(
  io: EditIO,
  schema: Schema,
  request: Extract<EditRequest, { kind: "create" }>,
): Promise<Result> {
  /*
    ADR 0009: a new Article starts Approved — somebody typing a headline into
    an editor command has already decided to run it. the value is looked up in
    the schema rather than written down, so renaming the option here means
    HareWare says the option is gone rather than sending notion a word it
    rejects with a 400 that reads like a bad id
  */
  const status = optionNamed(
    schema,
    ARTICLE_PROPERTIES.status.name,
    "approved",
  );

  const planned = planCreate(schema, {
    headline: request.headline,
    byline: request.byline,
    status,
    section: request.section,
  });
  if (planned.status === "refused") return failed(planned.reason);

  const page = await io.create({ properties: planned.plan.properties });
  await io.index(page);

  const noted =
    status === null
      ? ` (Notion has no "approved" option on ${ARTICLE_PROPERTIES.status.name} any more, so it was left unset)`
      : "";

  return ok(
    `Created **${request.headline}**${noted}. ${planned.plan.sentence}`,
  );
}

/** the shared tail of a change: send it, index the answer, say what it did */
async function apply(
  io: EditIO,
  page: ArticlePage,
  planned: PlanResult,
): Promise<Result> {
  if (planned.status === "refused") return failed(planned.reason);

  const updated = await io.patch(page.id, {
    properties: planned.plan.properties,
  });

  /*
    the page notion answered the PATCH with, not the one we read: it is the
    newest state that exists, so the index row and the reply are built from one
    object in one invocation and cost no extra request
  */
  await io.index(updated);

  return ok(planned.plan.sentence);
}

async function credit(
  io: EditIO,
  schema: Schema,
  page: ArticlePage,
  request: Extract<EditRequest, { kind: "credit" }>,
  actor: Actor,
): Promise<Result> {
  const text =
    request.credit === "author"
      ? ARTICLE_PROPERTIES.authorByline
      : ARTICLE_PROPERTIES.imageByline;
  const relation =
    request.credit === "author"
      ? ARTICLE_PROPERTIES.author
      : ARTICLE_PROPERTIES.imageCrew;

  /*
    the guard, checked before anything is read off the page rather than after.
    a relation notion is not sharing is absent from the schema and reads back
    as `[]` on every page, so the append below would silently delete every
    co-author. `assertProperties` is the only thing that can tell absent from
    empty
  */
  /* widened: the config names are a union of literals, and a property the
     schema is missing arrives as plain text */
  const pair: string[] = [text.name, relation.name];
  const unshared = assertProperties(schema).filter((miss) =>
    pair.includes(miss.name),
  );
  if (unshared.length > 0)
    return failed(
      `Notion is not sharing ${unshared
        .map((miss) => `${miss.name} (${miss.found ?? "absent"})`)
        .join(", ")}, so HareWare will not write a credit it cannot read back.`,
    );

  const held = relationIds(page.properties?.[relation.name]);
  const printed = plainText(page.properties?.[text.name]?.rich_text).trim();

  const found = await resolve(io, request.member, actor);
  if (found.status === "refused") return failed(found.reason);

  if (!found.member && request.byline === null)
    return failed(
      `Give ${request.credit === "author" ? "an author" : "an image credit"}: a member, a byline, or both.`,
    );

  const name = request.byline ?? found.member!.name;

  /*
    `also` appends. without a member the relation is carried through unchanged
    rather than replaced with an empty list: changing a printed Byline to a
    pseudonym must not quietly unlink the person it belongs to — ADR 0004 keeps
    the two halves together, and dropping one of them is the drift it accepts
    the denormalisation to avoid
  */
  /* already credited, so `also` has nothing to add. the relation deduped and
     the printed byline did not, which made a second run — a slow follow-up, an
     editor who thought it had not landed — write "Bob and Bob" while the
     relation stayed correct. the two halves ADR 0004 keeps together came apart,
     and only the printed one was wrong */
  const already = found.member ? held.includes(found.member.pageId) : false;

  const memberIds = found.member
    ? request.also
      ? [...new Set([...held, found.member.pageId])]
      : [found.member.pageId]
    : held;

  const appending = request.also && printed !== "" && !already;
  const byline = appending
    ? `${printed} and ${name}`
    : already
      ? printed
      : name;

  const planned = planCredit(schema, page, {
    credit: request.credit,
    byline,
    memberIds,
  });

  const result = await apply(io, page, planned);
  if (result.outcome !== "ok" || found.note === undefined) return result;

  // the roster changing is a fact an editor has to be told, every time
  return ok(`${result.summary} — ${found.note}`);
}

/* ---- who the picker pointed at ------------------------------------------ */

type Resolved =
  | { status: "resolved"; member: Member | null; note?: string }
  | { status: "refused"; reason: string };

/**
 * the Members row behind a picked discord user, and what to say about it.
 *
 * every uncertain outcome refuses. `conflicted` names both pages because two
 * rows sharing a discord id is a data problem somebody has to go and fix, and
 * taking the first would attribute Articles to the wrong person permanently
 * with nothing downstream able to notice
 */
async function resolve(
  io: EditIO,
  picked: PickedUser | null,
  actor: Actor,
): Promise<Resolved> {
  if (!picked) return { status: "resolved", member: null };

  const match = await io.members(picked.discordId, picked.displayName);

  switch (match.status) {
    case "matched":
      return { status: "resolved", member: match.member };

    case "linkable": {
      await io.link(match.member.pageId, match.patch);

      return {
        status: "resolved",
        member: match.member,
        note: `linked <@${picked.discordId}> to **${match.member.name}** in Members`,
      };
    }

    case "absent": {
      const made = await io.addMember(picked.displayName, picked.discordId);

      return {
        status: "resolved",
        member: made,
        note: `created **${made.name}** in Members`,
      };
    }

    case "ambiguous":
      return {
        status: "refused",
        reason: `Members has ${match.members.length} rows named **${picked.displayName}** (${match.members
          .map((member) => member.pageId)
          .join(
            ", ",
          )}). ${actor.name}, put the Discord ID on the right one in Notion and run this again.`,
      };

    case "conflicted":
      return {
        status: "refused",
        reason: `Two Members carry the same Discord ID (${match.members
          .map((member) => `**${member.name}** (${member.pageId})`)
          .join(
            " and ",
          )}). HareWare will not guess which one wrote this — clear the duplicate in Notion first.`,
      };

    case "unavailable":
      return {
        status: "refused",
        reason: `HareWare could not read Members, so it wrote nothing: ${match.reason}`,
      };
  }
}

const plainText = (parts: { plain_text: string }[] | null | undefined) =>
  (parts ?? []).map((part) => part.plain_text).join("");

/* ---- the real outside world --------------------------------------------- */

/**
 * `EditIO` against notion, D1 and the log.
 *
 * the only place a token or a binding is touched, and it is deliberately
 * trivial: everything worth testing is above this line
 */
export function notionIO(env: Env): EditIO {
  const token = () => env.NOTION_TOKEN!;

  return {
    schema: () =>
      notion(
        `data_sources/${ARTICLES_DATA_SOURCE_ID}`,
        token(),
      ) as Promise<Schema>,

    page: (pageId) =>
      notion(`pages/${pageId}`, token()) as Promise<ArticlePage>,

    patch: (pageId, body) =>
      notion(`pages/${pageId}`, token(), body, "PATCH") as Promise<ArticlePage>,

    create: (body) =>
      notion(`pages`, token(), {
        parent: {
          type: "data_source_id",
          data_source_id: ARTICLES_DATA_SOURCE_ID,
        },
        ...body,
      }) as Promise<ArticlePage>,

    members: (discordId, displayName) =>
      resolveMember(env, discordId, displayName),

    link: (pageId, patch) => linkMember(env, pageId, patch),

    addMember: (name, discordId) => createMember(env, name, discordId),

    /* the index is a cache and never a reason to fail a write that landed —
       `upsert` swallows its own failures, and this drops the outcome */
    index: async (page) => {
      if (!env.DB) return;
      await upsert(env.DB, toEntry(page), { authoritative: true });
    },

    log: (result, actor) =>
      record(env.DB, {
        source: "command",
        action: "article-edit",
        outcome: result.outcome,
        summary: result.summary,
        actor: actor.id,
      }),
  };
}

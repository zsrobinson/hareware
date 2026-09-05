/* Run an Article edit against live Notion, preserve its returned page and
   record the outcome. External calls stay behind EditIO so refusals, partial
   writes and failed delivery can be tested without bindings. See ADR 0009. */

import { failed, ok, type Result } from "~/lib/result";
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
import { readableProperties, relationIds, type ArticlePage } from "./page";
import {
  changesSummary,
  current,
  sameValue,
  type ArticleChange,
  plan,
  planCreate,
  planCredit,
  type Intent,
  type PatchBody,
  type PlanResult,
} from "./write";
import { notion, plainText } from "~/lib/services/notion/client";

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
  | {
      kind: "create";
      headline: string;
      section: string | null;
      /** whoever the discord picker returned, or null when nobody was picked */
      member: PickedUser | null;
      /** the printed name, when the editor typed one */
      byline: string | null;
    }
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
  log: (result: Result, actor: Actor) => Promise<void>;
};

export type { ArticleChange } from "./write";
export type EditResult =
  | {
      status: "created" | "updated" | "unchanged";
      page: ArticlePage;
      changes: ArticleChange[];
      notes: string[];
    }
  | { status: "failed"; explanation: string; pageId?: string; notes: string[] };

export function editSummary(result: EditResult): string {
  const summary =
    result.status === "failed"
      ? result.explanation
      : `${result.status === "created" ? "Created article. " : result.status === "unchanged" ? "Unchanged. " : ""}${changesSummary(result.changes)}`;
  return [summary, ...result.notes].join(" — ");
}

const refused = (explanation: string): EditResult => ({
  status: "failed",
  explanation,
  notes: [],
});

/** Preserve the confirmed mutation even when recording its Invocation fails. */
export async function runEdit(
  io: EditIO,
  request: EditRequest,
  actor: Actor,
): Promise<EditResult> {
  const result = await attempt(io, request, actor);
  if (result.status === "failed" && request.kind !== "create")
    result.pageId = request.pageId;
  try {
    await io.log(
      result.status === "failed"
        ? failed(editSummary(result))
        : ok(editSummary(result)),
      actor,
    );
  } catch (error) {
    console.error("[article] could not record edit", error);
    result.notes.push("The invocation log could not be saved.");
  }
  return result;
}

async function attempt(
  io: EditIO,
  request: EditRequest,
  actor: Actor,
): Promise<EditResult> {
  let schema: Schema;
  try {
    schema = await io.schema();
  } catch (error) {
    return refused(`Notion did not answer with its schema: ${String(error)}`);
  }

  try {
    if (request.kind === "create")
      return await create(io, schema, request, actor);

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
    return refused(
      `The edit could not be confirmed: ${String(error)}. Check Notion and Members before retrying.`,
    );
  }
}

/* ---- the three behaviours ----------------------------------------------- */

async function create(
  io: EditIO,
  schema: Schema,
  request: Extract<EditRequest, { kind: "create" }>,
  actor: Actor,
): Promise<EditResult> {
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

  /*
    the same resolution `/article author` uses, so picking a writer here
    backfills or creates their Members row rather than leaving the relation
    empty. without a picker the Byline is text and the relation stays empty,
    which is what a pseudonym needs
  */
  const found = await resolve(io, request.member, actor);
  if (found.status === "refused") return refused(found.reason);

  /* ADR 0004: the printed Byline is always filled — the typed one, else the
     member's name, else whoever ran the command */
  const byline = request.byline ?? found.member?.name ?? actor.name;

  const planned = planCreate(schema, {
    headline: request.headline,
    byline,
    authorIds: found.member ? [found.member.pageId] : [],
    status,
    section: request.section,
  });
  if (planned.status === "refused")
    return {
      status: "failed",
      explanation: planned.reason,
      notes: found.note ? [found.note] : [],
    };

  let page: ArticlePage;
  try {
    page = await io.create({ properties: planned.plan.properties });
  } catch (error) {
    return {
      status: "failed",
      explanation: `The article creation could not be confirmed: ${String(error)}. Check Notion before retrying.`,
      notes: found.note ? [found.note] : [],
    };
  }

  if (
    !readableProperties(
      page,
      planned.plan.changes.map(({ property }) => property),
    )
  )
    return {
      status: "failed",
      pageId: page.id,
      explanation:
        "Notion created the article but did not return all its properties. Open Notion to check it before making another article.",
      notes: found.note ? [found.note] : [],
    };

  const noted =
    status === null
      ? `Notion has no "approved" option on ${ARTICLE_PROPERTIES.status.name} any more, so it was left unset.`
      : "";

  return {
    status: "created",
    page,
    changes: planned.plan.changes.map((change) => ({
      ...change,
      after: current(page, change.property),
    })),
    notes: [noted, found.note].filter((note): note is string => Boolean(note)),
  };
}

/** the shared tail of a change: send it, and say what it did */
async function apply(
  io: EditIO,
  page: ArticlePage,
  planned: PlanResult,
): Promise<EditResult> {
  if (planned.status === "refused") return refused(planned.reason);
  if (
    !readableProperties(
      page,
      planned.plan.changes.map(({ property }) => property),
    )
  )
    return refused(
      "Notion did not return the properties this edit needs, so HareWare wrote nothing to the article.",
    );

  if (
    planned.plan.changes.every(({ before, after }) => sameValue(before, after))
  )
    return {
      status: "unchanged",
      page,
      changes: planned.plan.changes,
      notes: [],
    };

  let updated: ArticlePage;
  try {
    updated = await io.patch(page.id, { properties: planned.plan.properties });
  } catch (error) {
    return {
      status: "failed",
      pageId: page.id,
      explanation: `The article update could not be confirmed: ${String(error)}. Check Notion before retrying.`,
      notes: [],
    };
  }
  if (
    !readableProperties(
      updated,
      planned.plan.changes.map(({ property }) => property),
    )
  )
    return {
      status: "failed",
      pageId: updated.id || page.id,
      explanation:
        "Notion answered the write without all edited properties, so the result could not be confirmed. Check Notion before retrying.",
      notes: [],
    };
  const confirmed = planned.plan.changes.map((change) => ({
    ...change,
    after: current(updated, change.property),
  }));
  const changes = confirmed.filter(
    ({ before, after }) => !sameValue(before, after),
  );
  return {
    status: changes.length ? "updated" : "unchanged",
    page: updated,
    changes: changes.length ? changes : confirmed,
    notes: [],
  };
}

async function credit(
  io: EditIO,
  schema: Schema,
  page: ArticlePage,
  request: Extract<EditRequest, { kind: "credit" }>,
  actor: Actor,
): Promise<EditResult> {
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
    return refused(
      `Notion is not sharing ${unshared
        .map((miss) => `${miss.name} (${miss.found ?? "absent"})`)
        .join(", ")}, so HareWare will not write a credit it cannot read back.`,
    );

  if (
    !readableProperties(
      page,
      request.credit === "author"
        ? ["authorByline", "author"]
        : ["imageByline", "imageCrew"],
    )
  )
    return refused(
      "Notion did not return both credit properties, so HareWare wrote nothing.",
    );

  const held = relationIds(page.properties?.[relation.name]);
  const printed = plainText(page.properties?.[text.name]?.rich_text).trim();

  const found = await resolve(io, request.member, actor);
  if (found.status === "refused") return refused(found.reason);

  if (!found.member && request.byline === null)
    return refused(
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
  if (found.note) result.notes.push(found.note);
  if (result.status !== "failed" && found.member) {
    for (const change of result.changes) {
      if (change.property === "author" || change.property === "imageCrew")
        change.member = { id: found.member.pageId, name: found.member.name };
    }
  }
  return result;
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
        note: `Linked ${match.member.name} to their Discord account in Members.`,
      };
    }

    case "absent": {
      const made = await io.addMember(picked.displayName, picked.discordId);

      return {
        status: "resolved",
        member: made,
        note: `Created ${made.name} in Members.`,
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

/*
  the one shape every roster mutation route takes.

  six routes back the three pages ADR 0010 adds, and each of them has to do the
  same four things before and after the one line that matters: check
  @Editorial Board against discord, read a json body that came from a browser
  and is therefore a stranger, write an Invocation, and turn a thrown error
  into a status rather than a stack trace. Written six times, one of those gets
  forgotten — and the one that gets forgotten is the check, because it is the
  only one whose absence nothing visibly breaks.

  so the route files below `~/pages/api/members` contain no auth code at all.
  They hand `rosterRoute` a parser and a body, and it is not possible to write
  one that skips the gate.

  the islands are not trusted for any of this. A page that only renders a
  button for an editor is a page whose button anybody can `fetch` — the check
  belongs on the server side of every one of these, exactly as ADR 0007 has it
  for the admin pages themselves.

  the GET routes the islands refetch through are behind the same `admission`
  as the mutations, and deliberately behind the *same function* rather than the
  same rule written twice. The reads answer with the roster: every name, email
  and discord id the club has. A gate re-implemented beside the one that works
  is how the copy that is wrong ends up on the route nobody was watching.
*/

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { adminAccess } from "~/lib/admin";
import { DENIALS } from "~/lib/denial";
import { record } from "~/lib/log";
import type { Invocation } from "~/lib/db/schema";
import { readGuildMembers, type Profile } from "~/lib/member";
import type { Person } from "./records";
import { BadRequest } from "./refusal";
import { statusOptions } from "./roster";

export { BadRequest };

/**
 * what a roster mutation records about itself.
 *
 * its own action rather than the sync's. These share a subject — who the
 * roster thinks somebody is — but not a provenance, and provenance is the
 * whole point of the row: somebody auditing an election has to be able to ask
 * "what did people change about the roster" and get merges and attendance,
 * without the hourly cron's creates buried in the same answer.
 *
 * one value for all six routes, at the granularity `article-edit` already
 * uses. the summary says which one it was
 */
const ACTION: Invocation["action"] = "roster-edit";

/** what a mutation hands back: a line for the log, and anything the island needs */
export type MutationResult = {
  /** the log line, in the words the log page prints */
  summary: string;
  /** returned to the caller as json; the island re-renders from it */
  data?: Record<string, unknown>;
};

/**
 * whether the caller may be here, and who they are if so.
 *
 * a union rather than a nullable member: "not admitted" carries the response
 * that refuses them, so a route cannot hold half the answer and reach past it.
 * Every route below `~/pages/api/members`, read or write, starts here
 */
type RouteAccess =
  { admitted: true; actor: string } | { admitted: false; refusal: Response };

async function admission(request: Request): Promise<RouteAccess> {
  const access = await adminAccess(request);

  /* the status the admin pages refuse with, so an outage reads as 503 rather
     than as a refusal. ADR 0007's amendment */
  if (!access.allowed) {
    const { status, title } = DENIALS[access.denial];
    return {
      admitted: false,
      refusal: json({ error: title, denial: access.denial }, status),
    };
  }

  return { admitted: true, actor: access.who.session.discordUserId };
}

/**
 * a GET route the islands refetch through after a mutation.
 *
 * these answer the shapes in `~/lib/members/views`, which the pages also hand
 * down as `initialData`, so arriving at a page costs no second request and
 * every write updates what is on screen without a reload.
 *
 * nothing is written and nothing is logged. An Invocation records what a
 * person did to the roster, and re-reading it is not one of those — a row per
 * refetch would bury the merges the log exists to show
 */
export function rosterRead<T>(
  load: (request: Request) => Promise<T>,
): APIRoute {
  return async ({ request }) => {
    const who = await admission(request);
    if (!who.admitted) return who.refusal;

    try {
      return json(await load(request), 200);
    } catch (thrown) {
      const why = thrown instanceof Error ? thrown.message : String(thrown);
      return json({ error: why }, thrown instanceof BadRequest ? 400 : 500);
    }
  };
}

/**
 * a POST route that mutates the roster.
 *
 * `parse` validates the decoded body and throws `BadRequest` with a message
 * safe to show a person; `run` performs the write. The split exists so a bad
 * body is a 400 that never reaches notion — a `null` page id sent to a relation
 * write is accepted by notion and quietly empties it.
 *
 * every outcome is logged, including the failures, because the point of the
 * log under ADR 0007 is that a thing which did not happen leaves a trace too.
 * A merge that threw halfway is precisely the row somebody needs to find later
 */
export function rosterRoute<Input>(
  parse: (body: unknown) => Input,
  run: (input: Input, actor: string) => Promise<MutationResult>,
): APIRoute {
  return async ({ request }) => {
    const who = await admission(request);
    if (!who.admitted) return who.refusal;

    let input: Input;
    try {
      input = parse(await request.json());
    } catch (thrown) {
      const why =
        thrown instanceof BadRequest ? thrown.message : "unreadable request";
      return json({ error: why }, 400);
    }

    try {
      const { summary, data } = await run(input, who.actor);

      await record(env.DB, {
        source: "button",
        action: ACTION,
        outcome: "ok",
        summary,
        actor: who.actor,
      });

      return json({ ok: true, summary, ...(data ?? {}) }, 200);
    } catch (thrown) {
      const why = thrown instanceof Error ? thrown.message : String(thrown);
      /* a stale link or merge is a refusal, not a fault */
      const refused = thrown instanceof BadRequest;

      await record(env.DB, {
        source: "button",
        action: ACTION,
        outcome: refused ? "skipped" : "failed",
        summary: `roster edit ${refused ? "refused" : "failed"}: ${why}`,
        actor: who.actor,
      });

      /*
        the message is returned rather than swallowed. these all wrap notion,
        whose refusals say useful things — a property that is not readable, a
        page in the trash — and the person reading it holds @Editorial Board,
        so there is nobody to leak it to who could not have asked notion
        directly
      */
      return json({ error: why }, refused ? 400 : 500);
    }
  };
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
}

/** a required string field, refused rather than coerced when it is missing */
export function requireText(body: unknown, field: string): string {
  const value = (body as Record<string, unknown> | null)?.[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequest(`${field} is required`);
  }
  return value.trim();
}

/** an optional string field; absent and empty are the same thing */
export function optionalText(body: unknown, field: string): string | null {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * a Notion page id, with or without its dashes, in the dashed lowercase form
 * notion answers with so it compares equal to ids read from the roster. These
 * go into url paths, so anything else is refused
 */
function notionId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const hex = /^[0-9a-f]{32}$/i.test(value)
    ? value
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        )
      ? value.replaceAll("-", "")
      : null;
  if (!hex) return null;

  const id = hex.toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/** a required Notion page id */
export function requirePageId(body: unknown, field: string): string {
  const id = notionId((body as Record<string, unknown> | null)?.[field]);
  if (!id) throw new BadRequest(`${field} is not a Notion id`);
  return id;
}

/** an optional list of Notion page ids; absent is different from empty and stays so */
export function optionalList(
  body: unknown,
  field: string,
): string[] | undefined {
  const value = (body as Record<string, unknown> | null)?.[field];
  if (value === undefined || value === null) return undefined;
  return requireList(body, field);
}

export function requireList(body: unknown, field: string): string[] {
  const value = (body as Record<string, unknown> | null)?.[field];
  const ids = Array.isArray(value) ? value.map(notionId) : [null];
  if (ids.includes(null)) {
    throw new BadRequest(`${field} must be a list of Notion ids`);
  }
  return ids as string[];
}

/* notion's email property refuses a malformed address with a 400 whose
   message names the property and not the value, so the shape is checked here
   where the reply can say what to fix */
export function requireEmail(body: unknown, field: string): string {
  const email = requireText(body, field);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequest(`${email} is not an email address`);
  }
  return email;
}

/**
 * refuses a status Notion does not have. Notion's `select` accepts a name it
 * has never seen and adds it, which is how a fourth status appears by typo
 */
export async function requireStatus(status: string): Promise<void> {
  const options = await statusOptions(env.NOTION_TOKEN!);
  if (!options.includes(status)) {
    throw new BadRequest(
      `${status} is not one of the statuses Notion has: ${options.join(", ")}`,
    );
  }
}

/**
 * the guild account a Discord id names, refused when it is not in the server
 * or another row already carries it: two rows with one id is the duplicate
 * the reconciler exists to find. `pageId` is the row being written, if any
 */
export async function requireFreeDiscordId(
  discordId: string,
  roster: Person[],
  pageId: string | null,
): Promise<Profile> {
  const profile = (await readGuildMembers(env.DISCORD_BOT_TOKEN)).get(
    discordId,
  );
  if (!profile) {
    throw new BadRequest(
      "that account is not in the server, so an editor has to send them an invite first",
    );
  }

  const taken = roster.find(
    (person) => person.discordId === discordId && person.pageId !== pageId,
  );
  if (taken) {
    throw new BadRequest(
      `${taken.name} already has that Discord account, so the two rows are the same person — merge them in the reconciler`,
    );
  }

  return profile;
}

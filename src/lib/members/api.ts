/*
  the wrapper every route under `~/pages/api/members` goes through: the
  @Editorial Board gate, body parsing, the Invocation and the error status. The
  routes hold no auth code, so none can skip the gate; `gate.test.ts` holds
  every route to it. ADR 0007.
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
import { errorMessage } from "~/lib/utils";

export { BadRequest };

/* shared with the sync's per-member rows; `source` and `actor` tell a
   person's edit from the cron's, and the summary says which edit it was */
const ACTION: Invocation["action"] = "roster-edit";

type MutationResult = {
  /** the log line */
  summary: string;
  /** returned to the island as json */
  data?: Record<string, unknown>;
};

type RouteAccess =
  { admitted: true; actor: string } | { admitted: false; refusal: Response };

async function admission(request: Request): Promise<RouteAccess> {
  const access = await adminAccess(request);

  /* the admin pages' statuses, so an outage is a 503 and not a refusal */
  if (!access.allowed) {
    const { status, title } = DENIALS[access.denial];
    return {
      admitted: false,
      refusal: json({ error: title, denial: access.denial }, status),
    };
  }

  return { admitted: true, actor: access.who.session.discordUserId };
}

/** a GET route the islands refetch a view through. Reads are not logged */
export function rosterRead<T>(
  load: (request: Request) => Promise<T>,
): APIRoute {
  return async ({ request }) => {
    const who = await admission(request);
    if (!who.admitted) return who.refusal;

    try {
      return json(await load(request), 200);
    } catch (thrown) {
      const why = errorMessage(thrown);
      return json({ error: why }, thrown instanceof BadRequest ? 400 : 500);
    }
  };
}

/** checked once here; the routes that need discord's refuse without it */
type Tokens = { notion: string; discord: string | undefined };

/**
 * a POST route that mutates the roster. `parse` throws `BadRequest` so a bad
 * body never reaches notion, which accepts a `null` relation id and empties
 * the relation. Every outcome is logged, failures included
 */
export function rosterRoute<Input>(
  parse: (body: unknown) => Input,
  run: (input: Input, tokens: Tokens) => Promise<MutationResult>,
): APIRoute {
  return async ({ request }) => {
    const who = await admission(request);
    if (!who.admitted) return who.refusal;

    if (!env.NOTION_TOKEN) {
      const why = "NOTION_TOKEN is not set";
      await record(env.DB, {
        source: "button",
        action: ACTION,
        outcome: "misconfigured",
        summary: `roster edit not attempted: ${why}`,
        actor: who.actor,
      });
      return json({ error: why }, 500);
    }
    const tokens = {
      notion: env.NOTION_TOKEN,
      discord: env.DISCORD_BOT_TOKEN,
    };

    let input: Input;
    try {
      input = parse(await request.json());
    } catch (thrown) {
      const why =
        thrown instanceof BadRequest ? thrown.message : "unreadable request";
      return json({ error: why }, 400);
    }

    try {
      const { summary, data } = await run(input, tokens);

      await record(env.DB, {
        source: "button",
        action: ACTION,
        outcome: "ok",
        summary,
        actor: who.actor,
      });

      return json({ ok: true, summary, ...(data ?? {}) }, 200);
    } catch (thrown) {
      const why = errorMessage(thrown);
      const refused = thrown instanceof BadRequest;

      await record(env.DB, {
        source: "button",
        action: ACTION,
        outcome: refused ? "skipped" : "failed",
        summary: `roster edit ${refused ? "refused" : "failed"}: ${why}`,
        actor: who.actor,
      });

      /* notion's message is useful, and only an editor can read it */
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

/** a required string field, trimmed */
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
 * a Notion page id with or without dashes, in the dashed form notion answers
 * with so it compares equal to roster ids. These go into url paths
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

export function requirePageId(body: unknown, field: string): string {
  const id = notionId((body as Record<string, unknown> | null)?.[field]);
  if (!id) throw new BadRequest(`${field} is not a Notion id`);
  return id;
}

/** an optional list of Notion page ids; absent stays distinct from empty */
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

/* notion refuses a malformed address without naming it, so the reply here does */
export function requireEmail(body: unknown, field: string): string {
  const email = requireText(body, field);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequest(`${email} is not an email address`);
  }
  return email;
}

/** refuses a status notion lacks: a `select` write adds any name it is given */
export async function requireStatus(
  token: string,
  status: string,
): Promise<void> {
  const options = await statusOptions(token);
  if (!options.includes(status)) {
    throw new BadRequest(
      `${status} is not one of the statuses Notion has: ${options.join(", ")}`,
    );
  }
}

/**
 * the account a Discord id names, refused when it is not in the server or a
 * row other than `pageId` already carries it
 */
export async function requireFreeDiscordId(
  token: string | undefined,
  discordId: string,
  roster: Person[],
  pageId: string | null,
): Promise<Profile> {
  const profile = (await readGuildMembers(token)).get(discordId);
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

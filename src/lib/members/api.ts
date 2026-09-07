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
*/

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { editorialBoardMember } from "~/lib/admin";
import { record } from "~/lib/log";
import type { Invocation } from "~/lib/db/schema";

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

/** a body that failed to parse, thrown so the parser can be a plain function */
export class BadRequest extends Error {}

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
    const member = await editorialBoardMember(request);
    /* the same answer the admin pages give: for anybody who may not be here,
       this route does not exist */
    if (!member) {
      return new Response("not found", {
        status: 404,
        headers: { "cache-control": "private, no-store" },
      });
    }

    let input: Input;
    try {
      input = parse(await request.json());
    } catch (thrown) {
      const why =
        thrown instanceof BadRequest ? thrown.message : "unreadable request";
      return json({ error: why }, 400);
    }

    try {
      const { summary, data } = await run(input, member.discordUserId);

      await record(env.DB, {
        source: "button",
        action: ACTION,
        outcome: "ok",
        summary,
        actor: member.discordUserId,
      });

      return json({ ok: true, summary, ...(data ?? {}) }, 200);
    } catch (thrown) {
      const why = thrown instanceof Error ? thrown.message : String(thrown);

      await record(env.DB, {
        source: "button",
        action: ACTION,
        outcome: "failed",
        summary: `roster edit failed: ${why}`,
        actor: member.discordUserId,
      });

      /*
        the message is returned rather than swallowed. these all wrap notion,
        whose refusals say useful things — a property that is not readable, a
        page in the trash — and the person reading it holds @Editorial Board,
        so there is nobody to leak it to who could not have asked notion
        directly
      */
      return json({ error: why }, 500);
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

/** a required array of strings — the attendee list, and nothing else so far */
export function requireList(body: unknown, field: string): string[] {
  const value = (body as Record<string, unknown> | null)?.[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new BadRequest(`${field} must be a list of ids`);
  }
  return value as string[];
}

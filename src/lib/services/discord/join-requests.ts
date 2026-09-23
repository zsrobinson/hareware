/*
  reading the applications people fill in to join the server.

  a server using member verification with manual approval asks a short form
  of everybody joining, which a moderator then approves. What the answers mean
  is the caller's business; this reads them.

  no gateway connection and no privileged intent: this is a plain REST read,
  and it returns the whole history rather than only what is pending.
*/

import { sendPatiently } from "~/lib/rate-limit";
import { GUILD_ID } from "./config";

/**
 * discord's own maximum for this endpoint.
 *
 * fifty-one applications exist at the time of writing and the club adds
 * perhaps fifty a year, so this is one request for several years yet
 */
const PAGE = 100;

/**
 * one answer on the form.
 *
 * the trap that cost an afternoon: every entry carries **both** `values` and
 * `response`. `values` echoes the question's configured options — for a
 * free-text field it is an array holding one empty string — while `response`
 * holds what the applicant typed. reading `values` produces a complete-looking
 * result in which every answer is blank, and nothing about it looks wrong
 */
type FormResponse = {
  field_type?: string;
  label?: string;
  values?: string[] | null;
  response?: string | null;
};

type RawRequest = {
  id: string;
  created_at?: string;
  application_status?: string;
  user_id: string;
  user?: { username?: string; global_name?: string | null };
  form_responses?: FormResponse[] | null;
};

/** an approved join request, with discord's form shape read out of it */
export type JoinRequest = {
  /** the join request's own id, used only for paging */
  id: string;
  userId: string;
  /** the name discord shows for the account */
  username: string;
  /** discord's timestamp, or null when it gave none */
  createdAt: string | null;
  /** each question and what was typed, trimmed; null when left blank */
  answers: { question: string; answer: string | null }[];
};

function toJoinRequest(raw: RawRequest): JoinRequest {
  return {
    id: raw.id,
    userId: raw.user_id,
    username: raw.user?.global_name || raw.user?.username || raw.user_id,
    createdAt: raw.created_at || null,
    answers: (raw.form_responses ?? [])
      /* the rules checkbox is a response like any other, but not a question
         anybody answered */
      .filter((response) => response.field_type !== "TERMS")
      .map((response) => ({
        question: response.label ?? "",
        answer: response.response?.trim() || null,
      })),
  };
}

/**
 * every approved join request, oldest last.
 *
 * the whole list every time. the endpoint does take `before` and `after`
 * snowflake cursors, so an incremental read is possible, but the results are
 * not reliably ordered by id — two entries on the first page measured out of
 * sequence — and a stored cursor that slips past a gap will never revisit it.
 * a watermark that silently stops seeing new members is a worse failure than
 * a request that costs nothing, so this is stateless by choice. See ADR 0010.
 *
 * paging uses the *smallest* id on a page rather than its last, for the same
 * reason: with the ordering untrustworthy, only the minimum is guaranteed not
 * to skip anybody.
 */
export async function approvedJoinRequests(
  token: string,
): Promise<JoinRequest[]> {
  const requests: JoinRequest[] = [];
  let before: string | undefined;

  for (;;) {
    const url = new URL(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/requests`,
    );
    url.searchParams.set("status", "APPROVED");
    url.searchParams.set("limit", String(PAGE));
    if (before) url.searchParams.set("before", before);

    /* discord meters per route and answers 429 with the wait it wants; the
       reconciler reads this on every visit and a 429 here took the page down */
    const response = await sendPatiently(
      () => fetch(url, { headers: { authorization: `Bot ${token}` } }),
      "discord join requests",
    );

    if (!response.ok) {
      /* the status and body are safe to surface; the token is not */
      throw new Error(
        `discord returned ${response.status} for join requests: ${await response.text()}`,
      );
    }

    const answer = (await response.json()) as {
      guild_join_requests?: RawRequest[] | null;
      total?: number;
    };

    /*
      "nobody has applied" and "we are not allowed to read applications" have
      to be different answers, and from this endpoint they look identical.

      discord answers a readable query with `{ guild_join_requests: [...] }`,
      and a readable query with no matches as `{ "total": 0 }`. Without the
      permission it answers `{}` — no list, no count, HTTP 200. Not a 403,
      which is what every other endpoint gives: `/guilds/{id}/bans` and
      `/guilds/{id}/audit-logs` both refuse this bot properly.

      that cost this project the backfill. On 2026-09-07 the bot held
      Administrator and this endpoint returned 51 approved applications; the
      role was then narrowed to Manage Server and the same call started
      answering `{}`. A check on the status code alone said everything was
      fine, and the sync would have reported "no new applications out of 0"
      every hour for the rest of the year.

      so an answer carrying neither is refused, and the message names the
      permission, because that is the fix. ADR 0007 asks for the difference
      between a run that did nothing and a run that could not try
    */
    if (!answer.guild_join_requests && answer.total === undefined) {
      throw new Error(
        "discord returned neither a list nor a count for join requests, which is what it does when the bot may not review applications: give the HareWare role Kick Members, which is the permission Discord gates member applications behind",
      );
    }

    const page = answer.guild_join_requests;

    /* a count of applications we were not given is a short answer, not an
       empty one */
    if (!page && (answer.total ?? 0) > requests.length) {
      throw new Error(
        `discord counted ${answer.total} join requests and returned no list`,
      );
    }

    if (!page?.length) break;

    requests.push(...page.map(toJoinRequest));
    if (page.length < PAGE) break;

    /* compared as numbers, not as text: a snowflake is 18 or 19 digits, and
       lexicographic order puts every 18-digit id below every 19-digit one */
    before = page.reduce(
      (lowest, raw) => (BigInt(raw.id) < BigInt(lowest) ? raw.id : lowest),
      page[0]!.id,
    );
  }

  return requests;
}

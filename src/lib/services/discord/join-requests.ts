/*
  the answers people give to a server's member-verification form, read over
  REST. What the answers mean is the caller's business.
*/

import { sendPatiently } from "~/lib/rate-limit";
import { GUILD_ID } from "./config";

/** discord's maximum for this endpoint */
const PAGE = 100;

/**
 * one answer on the form. What was typed is in `response`; `values` echoes the
 * question's options, which for a free-text field is `[""]`, so reading it
 * blanks every answer without looking wrong
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

export type JoinRequest = {
  /** the join request's own id */
  id: string;
  userId: string;
  username: string;
  createdAt: string | null;
  /** each question and what was typed; null when left blank */
  answers: { question: string; answer: string | null }[];
};

function toJoinRequest(raw: RawRequest): JoinRequest {
  return {
    id: raw.id,
    userId: raw.user_id,
    username: raw.user?.global_name || raw.user?.username || raw.user_id,
    createdAt: raw.created_at || null,
    answers: (raw.form_responses ?? [])
      /* the rules checkbox */
      .filter((response) => response.field_type !== "TERMS")
      .map((response) => ({
        question: response.label ?? "",
        answer: response.response?.trim() || null,
      })),
  };
}

/**
 * every approved join request, read whole each time: results are not reliably
 * ordered by id, so a stored cursor could skip somebody for good (ADR 0010).
 * Pages from the smallest id on a page for the same reason
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

    const response = await sendPatiently(
      () => fetch(url, { headers: { authorization: `Bot ${token}` } }),
      "discord join requests",
    );

    if (!response.ok) {
      throw new Error(
        `discord returned ${response.status} for join requests: ${await response.text()}`,
      );
    }

    const answer = (await response.json()) as {
      guild_join_requests?: RawRequest[] | null;
      total?: number;
    };

    /*
      without the permission this endpoint answers 200 with `{}`, not a 403. A
      readable query answers a list, or `{ "total": 0 }` when nobody matches,
      so an answer with neither is refused
    */
    if (!answer.guild_join_requests && answer.total === undefined) {
      throw new Error(
        "discord returned neither a list nor a count for join requests, which is what it does when the bot may not review applications: give the HareWare role Kick Members, which is the permission Discord gates member applications behind",
      );
    }

    const page = answer.guild_join_requests;

    /* a count with no list is a short answer, not an empty one */
    if (!page && (answer.total ?? 0) > requests.length) {
      throw new Error(
        `discord counted ${answer.total} join requests and returned no list`,
      );
    }

    if (!page?.length) break;

    requests.push(...page.map(toJoinRequest));
    if (page.length < PAGE) break;

    /* as numbers: snowflakes differ in length */
    before = page.reduce(
      (lowest, raw) => (BigInt(raw.id) < BigInt(lowest) ? raw.id : lowest),
      page[0]!.id,
    );
  }

  return requests;
}

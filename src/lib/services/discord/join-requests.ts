/*
  reading the applications people fill in to join the server.

  the club's server uses discord's member verification with manual approval, so
  joining means answering a short form — full name, email, graduation year, and
  a paragraph — which an editor then approves. those answers are the cleanest
  identity data the club has, and ADR 0010 makes them the input to the roster.

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

/** an approved application, in the words the roster uses */
export type Application = {
  /** the join request's own id, used only for paging */
  id: string;
  discordId: string;
  /** their discord handle, for a page that has to name somebody with no answers */
  username: string;
  /** what they typed, trimmed; null when the question was not answered */
  name: string | null;
  email: string | null;
  /** free text on purpose — "Dec 2027" and "It depends" are both real answers */
  gradYear: string | null;
  /** `YYYY-MM-DD`, the day they applied */
  applied: string;
};

/**
 * the answer to whichever question mentions `keyword`.
 *
 * matched on the label rather than on position, because a question added in
 * the middle of the form would shift every index by one and silently move
 * everybody's email into their name. the cost is that rewording a question in
 * discord past the keyword makes that field read `null` — which surfaces on
 * the reconciler as an application missing a field, rather than as a wrong
 * value written into notion
 */
function answer(responses: FormResponse[], keyword: string): string | null {
  const found = responses.find((response) =>
    (response.label ?? "").toLowerCase().includes(keyword),
  );

  return found?.response?.trim() || null;
}

export function toApplication(raw: RawRequest): Application {
  const responses = (raw.form_responses ?? []).filter(
    /* the rules checkbox is a response like any other, and its label mentions
       nothing we look for — but excluding it keeps the keyword search honest */
    (response) => response.field_type !== "TERMS",
  );

  return {
    id: raw.id,
    discordId: raw.user_id,
    username: raw.user?.global_name || raw.user?.username || raw.user_id,
    name: answer(responses, "name"),
    email: answer(responses, "email"),
    gradYear: answer(responses, "year"),
    applied: (raw.created_at ?? "").slice(0, 10),
  };
}

/**
 * every approved application, oldest last.
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
export async function approvedApplications(
  token: string,
): Promise<Application[]> {
  const applications: Application[] = [];
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

    const page = (
      (await response.json()) as {
        guild_join_requests?: RawRequest[] | null;
      }
    ).guild_join_requests;

    if (!page?.length) break;

    applications.push(...page.map(toApplication));
    if (page.length < PAGE) break;

    /* compared as numbers, not as text: a snowflake is 18 or 19 digits, and
       lexicographic order puts every 18-digit id below every 19-digit one */
    before = page.reduce(
      (lowest, raw) => (BigInt(raw.id) < BigInt(lowest) ? raw.id : lowest),
      page[0]!.id,
    );
  }

  return applications;
}

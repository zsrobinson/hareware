/*
  the club's join form, read as identity.

  the server asks everybody joining for their full name, email, graduation
  year and a paragraph, and an editor approves them. Those answers are the
  cleanest identity data the club has, and ADR 0010 makes them the input to
  the roster.
*/

import {
  approvedJoinRequests,
  type JoinRequest,
} from "~/lib/services/discord/join-requests";

/** an approved application, in the words the roster uses */
export type Application = {
  /** the join request's own id */
  id: string;
  discordId: string;
  /** their discord handle, for a page that has to name somebody with no answers */
  username: string;
  /** what they typed, trimmed; null when the question was not answered */
  name: string | null;
  email: string | null;
  /** free text on purpose — "Dec 2027" and "It depends" are both real answers */
  gradYear: string | null;
  /** `YYYY-MM-DD`, the day they applied, or null when discord did not say */
  applied: string | null;
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
function answer(request: JoinRequest, keyword: string): string | null {
  return (
    request.answers.find((one) => one.question.toLowerCase().includes(keyword))
      ?.answer ?? null
  );
}

function toApplication(request: JoinRequest): Application {
  return {
    id: request.id,
    discordId: request.userId,
    username: request.username,
    name: answer(request, "name"),
    email: answer(request, "email"),
    gradYear: answer(request, "year"),
    applied: request.createdAt?.slice(0, 10) ?? null,
  };
}

/** every approved application, read whole each time; see ADR 0010 */
export async function approvedApplications(
  token: string | undefined,
): Promise<Application[]> {
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");
  return (await approvedJoinRequests(token)).map(toApplication);
}

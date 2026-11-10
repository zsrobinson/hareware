/*
  How a gated API says no. The admin pages are static shells (ADR 0012), so the
  page a refused member sees is drawn from this answer: which of the four
  refusals it is, and the name to say it to.
*/

import type { Denial } from "./denial";
import { DENIALS } from "./denial";
import type { Profile } from "./member";

/** the body of a refusal, which `DenialMessage` in ~/components/gated draws */
export type RefusalBody = { denial: Denial; you: string | null };

export function refusal(denial: Denial, profile?: Profile | null): Response {
  const body: RefusalBody = {
    denial,
    you: profile ? `@${profile.username}` : null,
  };
  return Response.json(body, {
    status: DENIALS[denial].status,
    headers: { "cache-control": "private, no-store" },
  });
}

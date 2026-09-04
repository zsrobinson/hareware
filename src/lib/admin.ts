/*
  who may reach the admin tools.

  membership of @Editorial Board is checked against discord on every request
  rather than captured at sign-in, so a role removed in discord takes effect
  immediately. that costs one request per page view, and ADR 0007 records why
  it was judged worth it for the surface holding the byline-to-member mapping.

  that same request carries the member's nickname and avatar, so identity comes
  back with it rather than being kept anywhere — see ~/lib/member
*/

import { getSessionSecret } from "./auth-config";
import { EDITORIAL_BOARD_ROLE_ID } from "./services/discord/config";
import { guildMember, type Profile } from "./member";
import { getSession, type Session } from "./session";

/** the signed-in member, what to call them, and whether they may see the tools */
export type Viewer = {
  session: Session;
  /** null when discord could not be reached, or they have left the server */
  profile: Profile | null;
  admin: boolean;
};

/**
 * the same thing as the nav islands take it, where signed-out is a value.
 *
 * `viewer()` returns null for "nobody is signed in", which is the right shape
 * for a guard. the sidebar has to draw something either way, so it takes this
 */
export type ViewerState = {
  session: Session | null;
  profile: Profile | null;
  admin: boolean;
};

/** `viewer()` in the shape the layout wants, so a page can always pass it */
export function viewerState(who: Viewer | null): ViewerState {
  return {
    session: who?.session ?? null,
    profile: who?.profile ?? null,
    admin: who?.admin ?? false,
  };
}

/**
 * everything a page needs to know about whoever is asking, in one lookup.
 *
 * `admin` false covers every way of not being allowed in — not in the server,
 * without the role, or discord being unreachable — because the admin tools
 * answer all of them the same way: the page does not exist
 */
export async function viewer(request: Request): Promise<Viewer | null> {
  const session = await getSession(request, getSessionSecret());
  if (!session) return null;

  const member = await guildMember(session.discordUserId);

  return {
    session,
    profile: member?.profile ?? null,
    admin: member?.roleIds.includes(EDITORIAL_BOARD_ROLE_ID) ?? false,
  };
}

/**
 * the signed-in member, if they hold @Editorial Board, and null otherwise.
 *
 * the shape the admin pages guard on: one call that either hands back a member
 * or does not, so there is no way to read the session without the check
 */
export async function editorialBoardMember(
  request: Request,
): Promise<Session | null> {
  const who = await viewer(request);
  return who?.admin ? who.session : null;
}

/** what an admin route returns to anyone who may not see it */
export function notFound() {
  return new Response("not found", {
    status: 404,
    headers: { "cache-control": "private, no-store" },
  });
}

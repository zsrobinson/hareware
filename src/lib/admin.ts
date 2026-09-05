/*
  Who may reach the admin tools. @Editorial Board is checked against Discord on
  every request rather than captured at sign-in, so losing the role takes effect
  immediately; the same request carries the profile, so identity is never
  stored. A refusal names which of four things is wrong. ADR 0007 for both.
*/

import { getSessionSecret } from "./auth-config";
import type { Denial } from "./denial";
import { EDITORIAL_BOARD_ROLE_ID } from "./services/discord/config";
import { guildMember, type Profile } from "./member";
import { getSession, type Session } from "./session";

/**
 * the signed-in member, what to call them, and whether they may see the tools.
 *
 * `admin` and `denial` are one choice rather than two fields: a viewer who may
 * not be here always carries the reason, and one who may cannot carry a stale
 * one. that is what lets the guard read the reason without a fallback
 */
export type Viewer = {
  session: Session;
  /** null when discord could not be reached, or they have left the server */
  profile: Profile | null;
} & ({ admin: true; denial: null } | { admin: false; denial: Denial });

/**
 * the same thing as the nav islands take it, where signed-out is a value.
 *
 * `viewer()` returns null for "nobody is signed in", which is the right shape
 * for a guard. the sidebar has to draw something either way, so it takes this.
 *
 * there is no `admin` here on purpose: the nav shows the admin tools to
 * everybody and the pages themselves refuse, so nothing the sidebar draws
 * varies by role any more
 */
export type ViewerState = {
  session: Session | null;
  profile: Profile | null;
};

/** `viewer()` in the shape the layout wants, so a page can always pass it */
export function viewerState(who: Viewer | null): ViewerState {
  return {
    session: who?.session ?? null,
    profile: who?.profile ?? null,
  };
}

/** everything a page needs to know about whoever is asking, in one lookup */
export async function viewer(request: Request): Promise<Viewer | null> {
  const session = await getSession(request, getSessionSecret());
  if (!session) return null;

  const member = await guildMember(session.discordUserId);

  if (member.status !== "member") {
    return {
      session,
      profile: null,
      admin: false,
      denial: member.status === "absent" ? "not-in-server" : "unreachable",
    };
  }

  return member.roleIds.includes(EDITORIAL_BOARD_ROLE_ID)
    ? { session, profile: member.profile, admin: true, denial: null }
    : { session, profile: member.profile, admin: false, denial: "no-role" };
}

/**
 * whoever is asking, and whether the admin tools may answer them.
 *
 * the shape the admin pages guard on: one call that either hands back an
 * allowed viewer or the reason it will not, so there is no way to read the
 * session without the check, and no way to refuse without saying why
 */
export type Access =
  | { allowed: true; who: Viewer }
  | { allowed: false; who: Viewer | null; denial: Denial };

export async function adminAccess(request: Request): Promise<Access> {
  const who = await viewer(request);

  if (!who) return { allowed: false, who: null, denial: "signed-out" };

  /*
    `viewer()` fills in `denial` wherever `admin` is false, and the two are set
    together so they cannot disagree. reading it rather than defaulting to
    "no-role" is deliberate: a default would be the place a future lookup state
    quietly became "you do not hold the role", which is the lie this whole
    guard exists to stop telling
  */
  if (!who.admin) return { allowed: false, who, denial: who.denial };

  return { allowed: true, who };
}

/**
 * the signed-in member, if they hold @Editorial Board, and null otherwise.
 *
 * what the api routes guard on, where the reason is nobody's business: a
 * caller holding a bearer secret gets a status code, not a page
 */
export async function editorialBoardMember(
  request: Request,
): Promise<Session | null> {
  const who = await viewer(request);
  return who?.admin ? who.session : null;
}

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
 * The signed-in member, what to call them, and whether they may see the tools.
 * `admin` and `denial` are one choice, so a refused viewer always carries its
 * reason and an admitted one cannot carry a stale one.
 */
export type Viewer = {
  session: Session;
  /** null when discord could not be reached, or they have left the server */
  profile: Profile | null;
} & ({ admin: true; denial: null } | { admin: false; denial: Denial });

/**
 * The same thing as the sidebar takes it, where signed-out is a value rather
 * than null. No `admin`: nothing the sidebar draws varies by role.
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

  /* Read rather than defaulted to "no-role": a default is where a lookup
     state nobody has thought about yet would quietly become a lie. */
  if (!who.admin) return { allowed: false, who, denial: who.denial };

  return { allowed: true, who };
}

/**
 * What the API routes guard on, where a caller holding a bearer secret gets a
 * status code rather than a page and the reason is nobody's business.
 */
export async function editorialBoardMember(
  request: Request,
): Promise<Session | null> {
  const who = await viewer(request);
  return who?.admin ? who.session : null;
}

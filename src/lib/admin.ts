/*
  Who may reach the admin tools, checked live against Discord on every request.
  The same lookup gives the profile. ADR 0007, ADR 0008.
*/

import { getSessionSecret } from "./auth-config";
import type { Denial } from "./denial";
import { EDITORIAL_BOARD_ROLE_ID } from "./services/discord/config";
import { guildMember, type Profile } from "./member";
import { getSession, type Session } from "./session";

/**
 * The signed-in member, what to call them, and whether they may see the tools.
 */
export type Viewer = {
  session: Session;
  /** null when discord could not be reached, or they have left the server */
  profile: Profile | null;
} & ({ admin: true; denial: null } | { admin: false; denial: Denial });

/** what the sidebar takes, where signed-out is a value rather than null */
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

/** whoever is asking, and whether the admin tools may answer them or why not */
export type Access =
  | { allowed: true; who: Viewer }
  | { allowed: false; who: Viewer | null; denial: Denial };

export async function adminAccess(request: Request): Promise<Access> {
  const who = await viewer(request);

  if (!who) return { allowed: false, who: null, denial: "signed-out" };

  if (!who.admin) return { allowed: false, who, denial: who.denial };

  return { allowed: true, who };
}

/** what the API routes guard on, where a refusal is only a status code */
export async function editorialBoardMember(
  request: Request,
): Promise<Session | null> {
  const who = await viewer(request);
  return who?.admin ? who.session : null;
}

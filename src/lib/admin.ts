/*
  who may reach the admin tools.

  membership of @Editorial Board is checked against discord on every request
  rather than captured at sign-in, so a role removed in discord takes effect
  immediately. that costs one request per page view, and ADR 0007 records why
  it was judged worth it for the surface holding the byline-to-member mapping
*/

import { env } from "cloudflare:workers";
import { getSessionSecret } from "./auth-config";
import { EDITORIAL_BOARD_ROLE_ID, GUILD_ID } from "./discord/config";
import { getSession, type Session } from "./session";

/**
 * the signed-in member, if they hold @Editorial Board, and null otherwise.
 *
 * null covers every way of not being allowed in — signed out, not in the
 * server, without the role, or discord being unreachable — because the admin
 * tools answer all of them the same way: the page does not exist
 */
export async function editorialBoardMember(
  request: Request,
): Promise<Session | null> {
  const session = await getSession(request, getSessionSecret());
  if (!session) return null;

  return (await holdsRole(session.discordUserId)) ? session : null;
}

async function holdsRole(userId: string): Promise<boolean> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return false;

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
      { headers: { authorization: `Bot ${token}` } },
    );

    // 404 is the ordinary answer for somebody who has left the server
    if (!response.ok) return false;

    const member = (await response.json()) as { roles?: unknown };

    return (
      Array.isArray(member.roles) &&
      member.roles.includes(EDITORIAL_BOARD_ROLE_ID)
    );
  } catch (error) {
    /*
      an outage denies rather than grants. the alternative fails open on the
      one surface where that matters most
    */
    console.error("[admin] could not check discord roles", error);
    return false;
  }
}

/** what an admin route returns to anyone who may not see it */
export function notFound() {
  return new Response("not found", {
    status: 404,
    headers: { "cache-control": "private, no-store" },
  });
}

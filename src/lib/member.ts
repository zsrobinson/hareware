/*
  who the signed-in member is, as discord currently has them.

  the session cookie holds one thing — the discord user id — and everything
  shown about a member is read live. that is not extra work: the admin check
  already asks discord for the member on every request, and the reply carries
  the profile alongside the roles, so one lookup answers both "may they" and
  "what are they called". change your nickname or avatar and the next page load
  has it, with nothing cached anywhere to go stale
*/

import { env } from "cloudflare:workers";
import { GUILD_ID } from "./discord/config";

/** what the ui draws. never what it decides anything from */
export type Profile = {
  /** server nickname, else discord display name, else username */
  displayName: string;
  /** the @handle under it, for telling two people with one name apart */
  username: string;
  /** ready to put in a src, already resolved to guild or account avatar */
  avatarUrl: string;
};

/** the member's roles and profile, from one request, or null if unreachable */
export type GuildMember = { roleIds: string[]; profile: Profile };

/**
 * discord's member object for somebody in the guild.
 *
 * null covers every way of not being there — no bot token, left the server,
 * discord down — because the caller treats all of them the same way: no roles,
 * so no admin, and no name, so the ui falls back to the id
 */
export async function guildMember(userId: string): Promise<GuildMember | null> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return null;

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
      { headers: { authorization: `Bot ${token}` } },
    );

    // 404 is the ordinary answer for somebody who has left the server
    if (!response.ok) return null;

    const member = (await response.json()) as {
      roles?: unknown;
      nick?: unknown;
      avatar?: unknown;
      user?: {
        id?: unknown;
        username?: unknown;
        global_name?: unknown;
        avatar?: unknown;
      };
    };

    if (!Array.isArray(member.roles)) return null;

    return {
      roleIds: member.roles.filter(
        (role): role is string => typeof role === "string",
      ),
      profile: readProfile(userId, member),
    };
  } catch (error) {
    /*
      an outage denies rather than grants, because the caller reads this as
      permission as well as identity. see ~/lib/admin
    */
    console.error("[member] could not reach discord", error);
    return null;
  }
}

/** a string field from discord, kept only when it is a non-empty one */
const text = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;

function readProfile(
  userId: string,
  member: {
    nick?: unknown;
    avatar?: unknown;
    user?: { username?: unknown; global_name?: unknown; avatar?: unknown };
  },
): Profile {
  const user = member.user ?? {};
  const username = text(user.username);

  return {
    /*
      most specific first. the nickname is what the club actually calls each
      other, and it is the name beside every message in the server — a panel
      that used the account name instead would be naming a different person as
      far as anyone reading it is concerned
    */
    displayName:
      text(member.nick) ?? text(user.global_name) ?? username ?? userId,
    username: username ?? userId,
    avatarUrl: avatarUrl(userId, text(member.avatar), text(user.avatar)),
  };
}

const CDN = "https://cdn.discordapp.com";
const SIZE = 64;

/** animated avatars are the ones whose hash is prefixed, and only as gif */
const extension = (hash: string) => (hash.startsWith("a_") ? "gif" : "png");

function avatarUrl(
  userId: string,
  guildAvatar: string | undefined,
  userAvatar: string | undefined,
) {
  /* a per-server avatar overrides the account one, the same way discord shows
     it in the member list */
  if (guildAvatar) {
    return `${CDN}/guilds/${GUILD_ID}/users/${userId}/avatars/${guildAvatar}.${extension(guildAvatar)}?size=${SIZE}`;
  }

  if (userAvatar) {
    return `${CDN}/avatars/${userId}/${userAvatar}.${extension(userAvatar)}?size=${SIZE}`;
  }

  /* an account that never set one gets a discord default, chosen from the id
     the way discord chooses it, so the fallback still differs person to person */
  const index = Number((BigInt(userId) >> 22n) % 6n);
  return `${CDN}/embed/avatars/${index}.png`;
}

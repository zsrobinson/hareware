/* the guild's members over REST: one with their roles, or the whole list. */

import { sendPatiently } from "~/lib/rate-limit";
import { GUILD_ID } from "./config";

/** what the ui draws; never decided from */
export type Profile = {
  /** server nickname, else discord display name, else username */
  displayName: string;
  /** the @handle */
  username: string;
  /** the guild avatar, else the account's, else discord's default */
  avatarUrl: string;
};

type GuildMember = { roleIds: string[]; profile: Profile };

/** "absent" is a fact about them; "unreachable" means we could not find out */
export type MemberLookup =
  | ({ status: "member" } & GuildMember)
  /** no such member: they left the guild, or were never in it */
  | { status: "absent" }
  /** discord did not answer, or could not be asked */
  | { status: "unreachable" };

/** "Unknown Member". 10004 Unknown Guild and 10013 Unknown User share its 404 */
const UNKNOWN_MEMBER = 10007;

async function errorCode(response: Response) {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "number" ? body.code : undefined;
  } catch {
    return undefined;
  }
}

export async function lookupMember(
  token: string,
  userId: string,
): Promise<MemberLookup> {
  try {
    const response = await sendPatiently(
      () =>
        fetch(
          `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
          { headers: { authorization: `Bot ${token}` } },
        ),
      "discord member lookup",
    );

    /* a 404 is also a wrong GUILD_ID or a removed bot; the code decides */
    if (response.status === 404) {
      const code = await errorCode(response);

      if (code === UNKNOWN_MEMBER) return { status: "absent" };

      console.error("[discord] discord 404 with error code", code);
      return { status: "unreachable" };
    }

    if (!response.ok) {
      console.error("[discord] discord answered", response.status);
      return { status: "unreachable" };
    }

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

    if (!Array.isArray(member.roles)) {
      console.error("[discord] member lookup returned no roles array");
      return { status: "unreachable" };
    }

    return {
      status: "member",
      roleIds: member.roles.filter(
        (role): role is string => typeof role === "string",
      ),
      profile: readProfile(userId, member),
    };
  } catch (error) {
    console.error("[discord] could not reach discord", error);
    return { status: "unreachable" };
  }
}

/** discord's cap on one page */
const PAGE = 1000;

/**
 * every member of the guild, by user id, paged to the end. Needs the Server
 * Members privileged intent; without it Discord answers 403
 */
export async function listMembers(
  token: string,
): Promise<Map<string, Profile>> {
  const profiles = new Map<string, Profile>();
  let after = "0";

  for (;;) {
    const response = await sendPatiently(
      () =>
        fetch(
          `https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=${PAGE}&after=${after}`,
          { headers: { authorization: `Bot ${token}` } },
        ),
      "discord member list",
    );

    if (!response.ok) {
      throw new Error(
        `Discord answered ${response.status} while reading guild members; check the Server Members intent`,
      );
    }

    const members: unknown = await response.json();
    if (!Array.isArray(members)) {
      throw new Error("Discord's guild member response was not a list");
    }

    for (const entry of members as Record<string, unknown>[]) {
      const member = entry as Parameters<typeof readProfile>[1];
      const userId = text(member.user?.id);
      if (!userId) continue;

      profiles.set(userId, readProfile(userId, member));
      /* compared as numbers: snowflakes differ in length */
      if (BigInt(userId) > BigInt(after)) after = userId;
    }

    if (members.length < PAGE) return profiles;
  }
}

const text = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;

function readProfile(
  userId: string,
  member: {
    nick?: unknown;
    avatar?: unknown;
    user?: {
      id?: unknown;
      username?: unknown;
      global_name?: unknown;
      avatar?: unknown;
    };
  },
): Profile {
  const user = member.user ?? {};
  const username = text(user.username);

  return {
    displayName:
      text(member.nick) ?? text(user.global_name) ?? username ?? userId,
    username: username ?? userId,
    avatarUrl: avatarUrl(userId, text(member.avatar), text(user.avatar)),
  };
}

const CDN = "https://cdn.discordapp.com";
const SIZE = 64;

/** an animated avatar's hash starts `a_` and is only a gif */
const extension = (hash: string) => (hash.startsWith("a_") ? "gif" : "png");

function avatarUrl(
  userId: string,
  guildAvatar: string | undefined,
  userAvatar: string | undefined,
) {
  if (guildAvatar) {
    return `${CDN}/guilds/${GUILD_ID}/users/${userId}/avatars/${guildAvatar}.${extension(guildAvatar)}?size=${SIZE}`;
  }

  if (userAvatar) {
    return `${CDN}/avatars/${userId}/${userAvatar}.${extension(userAvatar)}?size=${SIZE}`;
  }

  /* discord's own default, chosen from the id the way discord does */
  const index = Number((BigInt(userId) >> 22n) % 6n);
  return `${CDN}/embed/avatars/${index}.png`;
}

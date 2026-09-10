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
import { sendPatiently } from "./rate-limit";
import { GUILD_ID } from "./services/discord/config";

/** what the ui draws. never what it decides anything from */
export type Profile = {
  /** server nickname, else discord display name, else username */
  displayName: string;
  /** the @handle under it, for telling two people with one name apart */
  username: string;
  /** ready to put in a src, already resolved to guild or account avatar */
  avatarUrl: string;
};

/** the member's roles and profile, from one request */
export type GuildMember = { roleIds: string[]; profile: Profile };

/**
 * What asking Discord about somebody came back as. "absent" and "unreachable"
 * are separate because a member reads them differently: one means the club took
 * the role away, the other that we could not find out. Saying the first when
 * the second happened is a lie that survives a retry.
 */
export type MemberLookup =
  | ({ status: "member" } & GuildMember)
  /** no such member: they left the guild, or were never in it */
  | { status: "absent" }
  /** discord did not answer, or we have no token to ask with */
  | { status: "unreachable" };

/**
 * Discord's "Unknown Member". Its siblings, 10004 Unknown Guild and 10013
 * Unknown User, arrive with the same 404 and are about us, not their
 * membership.
 */
const UNKNOWN_MEMBER = 10007;

/** the `code` out of discord's error body, or undefined if it had none */
async function errorCode(response: Response) {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "number" ? body.code : undefined;
  } catch {
    /* an error body that is not json tells us nothing, and "nothing" is not
       evidence that somebody left */
    return undefined;
  }
}

/** discord's member object for somebody in the guild, or why we have none */
export async function guildMember(userId: string): Promise<MemberLookup> {
  const token = env.DISCORD_BOT_TOKEN;
  /* no token is our own misconfiguration, not a fact about the member */
  if (!token) return { status: "unreachable" };

  try {
    /* this runs in the middleware on every gated request, so a 429 refuses
       somebody who is a member. waited out rather than read as an answer */
    const response = await sendPatiently(
      () =>
        fetch(
          `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
          { headers: { authorization: `Bot ${token}` } },
        ),
      "discord member lookup",
    );

    /*
      A 404 is not one fact: Discord answers it both for a member who has left
      and for a guild it will not show us, meaning a wrong GUILD_ID or the bot
      removed. Only the first is about them, and the refusal page says so by
      name, so the error code has to decide.
    */
    if (response.status === 404) {
      const code = await errorCode(response);

      if (code === UNKNOWN_MEMBER) return { status: "absent" };

      console.error("[member] discord 404 with error code", code);
      return { status: "unreachable" };
    }

    /* anything else — a rate limit, a revoked token, discord having a bad day
       — says nothing about whether they are a member */
    if (!response.ok) {
      console.error("[member] discord answered", response.status);
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

    /* a 200 whose body is not the shape we asked for is discord behaving
       oddly, not a member who happens to hold no roles */
    if (!Array.isArray(member.roles)) {
      console.error("[member] discord returned no roles array");
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
    /* An outage denies rather than grants: the caller reads this as permission
       as well as identity. See ~/lib/admin. */
    console.error("[member] could not reach discord", error);
    return { status: "unreachable" };
  }
}

/** the guild in one request, which is what the list endpoint's cap allows */
const EVERYBODY = 1000;

/**
 * every member of the guild, by user id.
 *
 * one request for the whole server rather than one per person, which is what
 * makes a page of avatars affordable. It needs the Server Members privileged
 * intent; without it Discord answers 403. Callers choose whether that failure
 * is material or whether a page of names without avatars is still useful.
 */
async function readGuildMembers(
  token = env.DISCORD_BOT_TOKEN,
): Promise<Map<string, Profile>> {
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");

  const response = await sendPatiently(
    () =>
      fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=${EVERYBODY}`,
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

  const profiles = new Map<string, Profile>();

  for (const entry of members as Record<string, unknown>[]) {
    const member = entry as Parameters<typeof readProfile>[1];
    const userId = text(member.user?.id);
    if (userId) profiles.set(userId, readProfile(userId, member));
  }

  return profiles;
}

/** Every guild member, failing when Discord did not actually provide a list. */
export function requireGuildMembers(
  token?: string,
): Promise<Map<string, Profile>> {
  return readGuildMembers(token);
}

/** Every guild member where an empty fallback is acceptable, such as avatars. */
export async function guildMembers(): Promise<Map<string, Profile>> {
  try {
    return await readGuildMembers();
  } catch (error) {
    console.error("[member] could not reach discord", error);
    return new Map();
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

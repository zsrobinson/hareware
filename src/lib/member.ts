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
import {
  listMembers,
  lookupMember,
  type MemberLookup,
  type Profile,
} from "./services/discord/guild";

export type { MemberLookup, Profile };

/** discord's member object for somebody in the guild, or why we have none */
export async function guildMember(userId: string): Promise<MemberLookup> {
  const token = env.DISCORD_BOT_TOKEN;
  /* no token is our own misconfiguration, not a fact about the member */
  if (!token) return { status: "unreachable" };

  return lookupMember(token, userId);
}

/**
 * every member of the guild, by user id, failing rather than answering short.
 * Callers choose whether that failure is material or whether a page of
 * names without avatars is still useful.
 */
export async function readGuildMembers(
  token = env.DISCORD_BOT_TOKEN,
): Promise<Map<string, Profile>> {
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");
  return listMembers(token);
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

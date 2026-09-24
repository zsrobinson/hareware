/* guild members as discord has them now, read live with the bot token. ADR 0008. */

import { env } from "cloudflare:workers";
import {
  listMembers,
  lookupMember,
  type MemberLookup,
  type Profile,
} from "./services/discord/guild";

export type { MemberLookup, Profile };

/** somebody's roles and profile, or why we have none */
export async function guildMember(userId: string): Promise<MemberLookup> {
  const token = env.DISCORD_BOT_TOKEN;
  /* no token is our own misconfiguration, not a fact about the member */
  if (!token) return { status: "unreachable" };

  return lookupMember(token, userId);
}

/** every guild member by user id; throws rather than answering short */
export async function readGuildMembers(
  token = env.DISCORD_BOT_TOKEN,
): Promise<Map<string, Profile>> {
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");
  return listMembers(token);
}

/** every guild member, or none when discord fails: for avatars, where that is fine */
export async function guildMembers(): Promise<Map<string, Profile>> {
  try {
    return await readGuildMembers();
  } catch (error) {
    console.error("[member] could not reach discord", error);
    return new Map();
  }
}

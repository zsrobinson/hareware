/*
  the Members row behind a Discord user picked as an article's writer. Most rows
  carry no id, so a name match is linked and the roster backfills as editors
  credit people. Never guesses. ADR 0009.
*/

import { notion } from "~/lib/services/notion/client";
import { normaliseName } from "~/lib/members/match";
import type { Person } from "~/lib/members/records";
import { people } from "~/lib/members/roster";
import { createMember as createRow, memberPatch } from "~/lib/members/write";

export type Member = Pick<Person, "pageId" | "name" | "discordId">;

export type LinkPatch = ReturnType<typeof memberPatch>;

/** what a lookup found. `unavailable` is never `absent`, which would create a duplicate */
export type MemberMatch =
  /** exactly one row carries this snowflake */
  | { status: "matched"; member: Member }
  /** no id match, one name match — the caller decides whether to link */
  | { status: "linkable"; member: Member; patch: LinkPatch }
  /** several rows answer to this name; the editor picks */
  | { status: "ambiguous"; members: Member[] }
  /** nothing matched, on either the id or the name */
  | { status: "absent" }
  /** more than one row carries this snowflake, which is never safe to guess at */
  | { status: "conflicted"; members: Member[] }
  /** we could not ask notion */
  | { status: "unavailable"; reason: string };

/** decided over the whole roster: only that can tell one row carrying an id from two */
export function matchMembers(
  roster: Person[],
  discordId: string,
  displayName: string,
): MemberMatch {
  const members: Member[] = roster.map((person) => ({
    pageId: person.pageId,
    name: person.name,
    discordId: person.discordId,
  }));

  const byId = discordId
    ? members.filter((member) => member.discordId === discordId)
    : [];

  if (byId.length > 1) return { status: "conflicted", members: byId };
  if (byId.length === 1) return { status: "matched", member: byId[0]! };

  /* a row carrying somebody else's id is never a name candidate */
  const wanted = normaliseName(displayName);
  const byName = wanted
    ? members.filter(
        (member) =>
          member.discordId === null && normaliseName(member.name) === wanted,
      )
    : [];

  if (byName.length > 1) return { status: "ambiguous", members: byName };
  if (byName.length === 1)
    return {
      status: "linkable",
      member: byName[0]!,
      patch: memberPatch({ discordId }),
    };

  return { status: "absent" };
}

export async function linkMember(
  env: Env,
  pageId: string,
  patch: LinkPatch,
): Promise<void> {
  await notion(`pages/${pageId}`, env.NOTION_TOKEN!, patch, "PATCH");
}

/** only ever for an `absent` match */
export async function createMember(
  env: Env,
  name: string,
  discordId: string,
): Promise<Member> {
  const pageId = await createRow(env.NOTION_TOKEN!, { name, discordId });
  return { pageId, name, discordId };
}

/** the Members row behind a discord user, read live; a failure is `unavailable` */
export async function resolveMember(
  env: Env,
  discordId: string,
  displayName: string,
): Promise<MemberMatch> {
  if (!env.NOTION_TOKEN)
    return { status: "unavailable", reason: "NOTION_TOKEN is not set" };

  try {
    return matchMembers(await people(env.NOTION_TOKEN), discordId, displayName);
  } catch (error) {
    return {
      status: "unavailable",
      reason: `could not read Members: ${String(error)}`,
    };
  }
}

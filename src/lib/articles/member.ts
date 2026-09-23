/*
  finding the Members row behind a discord user.

  ADR 0009: an article's writer is picked with discord's native user picker, so
  what arrives is a snowflake and a display name and nothing else. most
  Members carry no Discord ID, so the id match is the *rare* path — the common
  one is matching the name, and writing the id onto the row it finds, so the
  roster backfills itself as editors credit people.

  the decision is a pure function over the rows. what this file must never do
  is guess: an ambiguous or absent match is returned for the caller to ask
  about, and two rows sharing one id are refused outright, because picking the
  first would attribute articles to the wrong person permanently and nothing
  downstream could notice.
*/

import { notion } from "~/lib/services/notion/client";
import { normaliseName } from "~/lib/members/match";
import type { Person } from "~/lib/members/records";
import { people } from "~/lib/members/roster";
import { createMember as createRow, memberPatch } from "~/lib/members/write";

/** a Members row in the words a reply uses */
export type Member = Pick<Person, "pageId" | "name" | "discordId">;

/** the patch that would write a discord id onto a row */
export type LinkPatch = ReturnType<typeof memberPatch>;

/**
 * what a lookup found.
 *
 * every outcome is its own state, and none of them is a falsy version of
 * another: "we could not ask" and "nobody is there" send the editor in
 * opposite directions, and flattening them is how a member gets created
 * twice
 */
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
  /** we could not ask notion. distinct from `absent` on purpose */
  | { status: "unavailable"; reason: string };

/**
 * which row belongs to a discord user, decided over the whole roster.
 *
 * the whole roster rather than a filtered query because the conflict case only
 * exists if you can see every row: a query that returns the first match cannot
 * tell one row carrying an id from two
 */
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

  /*
    a row that already carries somebody else's id is not a candidate however
    well its name reads. overwriting it would move every future credit for that
    person onto this one
  */
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

/**
 * writes a discord id onto an existing Members row.
 *
 * this is the backfill ADR 0009 is built around: most rows carry no id, so
 * the common credit is a name match, and doing it here means the roster fills
 * itself in as editors work rather than in somebody's afternoon
 */
export async function linkMember(
  env: Env,
  pageId: string,
  patch: LinkPatch,
): Promise<void> {
  await notion(`pages/${pageId}`, env.NOTION_TOKEN!, patch, "PATCH");
}

/**
 * a new Members row, for somebody the roster has never heard of.
 *
 * only ever reached from `absent` — never from `ambiguous` or `conflicted` —
 * because creating a row on an uncertain match is exactly how a database
 * acquires nine copies of one person. the caller says so in its reply
 */
export async function createMember(
  env: Env,
  name: string,
  discordId: string,
): Promise<Member> {
  const pageId = await createRow(env.NOTION_TOKEN!, { name, discordId });
  return { pageId, name, discordId };
}

/**
 * the Members row behind a discord user, read live.
 *
 * nothing about Members is ever held anywhere: a credit is a write, and every
 * write re-reads notion first so that what it reports changing *from* is true.
 *
 * a failure answers `unavailable`, never `absent`. absent sends the editor off
 * to create a member who is already there, and notion's write access is the
 * thing most likely to be refused here
 */
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

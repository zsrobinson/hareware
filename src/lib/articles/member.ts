/*
  finding the Members row behind a discord user.

  ADR 0009: an article's writer is picked with discord's native user picker, so
  what arrives is a snowflake and a display name and nothing else. only 9 of 48
  Members carry a Discord ID, so the id match is the *rare* path — the common
  one is matching the name, and writing the id onto the row it finds, so the
  roster backfills itself as editors credit people.

  the decision is a pure function over the rows. what this file must never do
  is guess: an ambiguous or absent match is returned for the caller to ask
  about, and two rows sharing one id are refused outright, because picking the
  first would attribute articles to the wrong person permanently and nothing
  downstream could notice.
*/

import { notion, plainText } from "~/lib/services/notion/client";
import { MEMBERS_DATA_SOURCE_ID, MEMBER_PROPERTIES } from "./config";

/** a Members row, as much of it as we read */
export type MemberPage = {
  id: string;
  properties: Record<
    string,
    {
      type?: string;
      title?: { plain_text: string }[] | null;
      rich_text?: { plain_text: string }[] | null;
    }
  >;
};

/** a Members row in the words a reply uses */
export type Member = {
  pageId: string;
  name: string;
  /** the id the row already carries, or null — never `""` */
  discordId: string | null;
};

/** the patch that would write a discord id onto a row */
export type LinkPatch = {
  properties: Record<string, { rich_text: { text: { content: string } }[] }>;
};

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
 * a name reduced to what two spellings of one person share.
 *
 * casefolded, accents stripped, punctuation dropped and whitespace collapsed,
 * so "Zoë O'Brien" and "zoe obrien" are one person. it goes no further than
 * that: "Matthew" and "Mathew" stay two people, because a matcher loose enough
 * to join them is loose enough to join two real members
 */
export function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * the discord id on a row, as text.
 *
 * text on both sides, always. a snowflake is 19 digits and a double holds 15
 * of them, so anything that parses one as a number matches every id sharing
 * its first fifteen — see `MEMBER_PROPERTIES.discordId`
 */
function discordIdOf(page: MemberPage): string | null {
  const text = plainText(
    page.properties?.[MEMBER_PROPERTIES.discordId.name]?.rich_text,
  ).trim();

  return text || null;
}

function toMember(page: MemberPage): Member {
  return {
    pageId: page.id,
    name: plainText(
      page.properties?.[MEMBER_PROPERTIES.name.name]?.title,
    ).trim(),
    discordId: discordIdOf(page),
  };
}

/** the patch that would put `discordId` on a row */
export function linkPatch(discordId: string): LinkPatch {
  return {
    properties: {
      [MEMBER_PROPERTIES.discordId.name]: {
        rich_text: [{ text: { content: discordId } }],
      },
    },
  };
}

/**
 * which row belongs to a discord user, decided over the whole roster.
 *
 * the whole roster rather than a filtered query because the conflict case only
 * exists if you can see every row: a query that returns the first match cannot
 * tell one row carrying an id from two
 */
export function matchMembers(
  pages: MemberPage[],
  discordId: string,
  displayName: string,
): MemberMatch {
  const members = pages.map(toMember);

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
      patch: linkPatch(discordId),
    };

  return { status: "absent" };
}

/**
 * writes a discord id onto an existing Members row.
 *
 * this is the backfill ADR 0009 is built around: 39 of 48 rows carry no id, so
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
  const page = (await notion(`pages`, env.NOTION_TOKEN!, {
    parent: { type: "data_source_id", data_source_id: MEMBERS_DATA_SOURCE_ID },
    properties: {
      [MEMBER_PROPERTIES.name.name]: { title: [{ text: { content: name } }] },
      ...linkPatch(discordId).properties,
    },
  })) as MemberPage;

  return toMember(page);
}

/** every Members row. 48 of them, so one request unless the club triples */
async function allMembers(token: string): Promise<MemberPage[]> {
  const pages: MemberPage[] = [];
  let cursor: string | undefined;

  do {
    const response = (await notion(
      `data_sources/${MEMBERS_DATA_SOURCE_ID}/query`,
      token,
      { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    )) as { results: MemberPage[]; has_more?: boolean; next_cursor?: string };

    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

/**
 * the Members row behind a discord user, read live.
 *
 * live rather than from the index: `article_index` describes Articles and
 * ADR 0009 keeps it serving autocomplete and nothing else, and a credit is a
 * write — it re-reads notion first, like every other command.
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
    return matchMembers(
      await allMembers(env.NOTION_TOKEN),
      discordId,
      displayName,
    );
  } catch (error) {
    return {
      status: "unavailable",
      reason: `could not read Members: ${String(error)}`,
    };
  }
}

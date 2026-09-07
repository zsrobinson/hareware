/*
  reading the three databases standing is computed from.

  every function here is a read and a shape conversion, and nothing here
  decides anything — `standing.ts` holds the rules and never touches the
  network, which is what lets the constitution be tested against fixtures.

  all three reads pull every row through the client's `queryAll`, which follows
  notion's cursor. the roster is fifty people, the meetings database a few
  hundred rows and the article corpus two requests' worth, so paging is about
  correctness rather than volume: a silently short answer is the worst shape a
  bug can take in something an election rests on.
*/

import { plainText, queryAll } from "~/lib/services/notion/client";
import {
  ARTICLES_DATA_SOURCE_ID,
  ARTICLE_PROPERTIES,
} from "~/lib/articles/config";
import {
  isMemberStatus,
  MEETINGS_DATA_SOURCE_ID,
  MEETING_PROPERTIES,
  MEMBERS_DATA_SOURCE_ID,
  MEMBER_PROPERTIES,
} from "./config";
import type { ContributionRecord, MeetingRecord, Person } from "./records";

/** every notion property shape these three databases hand back */
type Property = {
  type?: string;
  title?: { plain_text: string }[] | null;
  rich_text?: { plain_text: string }[] | null;
  email?: string | null;
  date?: { start?: string | null } | null;
  select?: { name?: string | null } | null;
  relation?: { id: string }[] | null;
};

type Page = { id: string; properties: Record<string, Property> };

function text(property: Property | undefined): string {
  return plainText(property?.title ?? property?.rich_text).trim();
}

function ids(property: Property | undefined): string[] {
  return (property?.relation ?? []).map((related) => related.id);
}

/** a Members row as standing sees it */
export function toPerson(page: Page): Person {
  const status =
    page.properties?.[MEMBER_PROPERTIES.status.name]?.select?.name ?? null;
  const email = page.properties?.[MEMBER_PROPERTIES.email.name]?.email;

  return {
    pageId: page.id,
    name: text(page.properties?.[MEMBER_PROPERTIES.name.name]),
    /* never `""` — the difference between "no id" and "empty id" is the
       difference between a row we may link and a row we may not */
    discordId:
      text(page.properties?.[MEMBER_PROPERTIES.discordId.name]) || null,
    email: email?.trim() || null,
    /*
      an unrecognised option is read as unknown rather than coerced. somebody
      adding a fourth status in notion should make the page say it does not
      know, not have it silently mean "current student"
    */
    status: isMemberStatus(status) ? status : null,
  };
}

export async function people(token: string): Promise<Person[]> {
  return (await queryAll<Page>(MEMBERS_DATA_SOURCE_ID, token)).map(toPerson);
}

/** a Meetings row as standing sees it */
export function toMeeting(page: Page): MeetingRecord {
  return {
    pageId: page.id,
    name: text(page.properties?.[MEETING_PROPERTIES.name.name]),
    date: page.properties?.[MEETING_PROPERTIES.date.name]?.date?.start ?? "",
    type: page.properties?.[MEETING_PROPERTIES.type.name]?.select?.name ?? null,
    attendeeIds: ids(page.properties?.[MEETING_PROPERTIES.attendees.name]),
  };
}

export async function meetings(token: string): Promise<MeetingRecord[]> {
  return (await queryAll<Page>(MEETINGS_DATA_SOURCE_ID, token)).map(toMeeting);
}

/** an Article reduced to the two credits that count toward standing */
export function toContribution(page: Page): ContributionRecord {
  return {
    pageId: page.id,
    headline: text(page.properties?.[ARTICLE_PROPERTIES.headline.name]),
    date:
      page.properties?.[ARTICLE_PROPERTIES.publicationDate.name]?.date?.start ??
      "",
    authorIds: ids(page.properties?.[ARTICLE_PROPERTIES.author.name]),
    imageCrewIds: ids(page.properties?.[ARTICLE_PROPERTIES.imageCrew.name]),
  };
}

/**
 * every published Article, filtered in notion rather than here.
 *
 * an article with no Publication Date has not published and counts toward
 * nothing, and there are enough of those — the tracker holds pitches and
 * approved-but-unwritten rows by design, per ADR 0006 — that asking notion to
 * drop them is worth the filter.
 *
 * the window is *not* pushed down with it. standing re-asks the same question
 * over different date ranges, and a caller that changed the range would be
 * comparing against a differently-filtered corpus without noticing
 */
export async function contributions(
  token: string,
): Promise<ContributionRecord[]> {
  const rows = await queryAll<Page>(ARTICLES_DATA_SOURCE_ID, token, {
    filter: {
      property: ARTICLE_PROPERTIES.publicationDate.name,
      date: { is_not_empty: true },
    },
  });

  return rows.map(toContribution);
}

/** everything standing needs, read together */
export type Corpus = {
  people: Person[];
  meetings: MeetingRecord[];
  contributions: ContributionRecord[];
};

/**
 * all three databases, concurrently.
 *
 * they share nothing and the page needs all three, so serialising them would
 * add two round trips to every question an editor asks. four notion requests
 * against a budget of three a second is comfortable
 */
export async function corpus(token: string): Promise<Corpus> {
  const [read, met, wrote] = await Promise.all([
    people(token),
    meetings(token),
    contributions(token),
  ]);

  return { people: read, meetings: met, contributions: wrote };
}

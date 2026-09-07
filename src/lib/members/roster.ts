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

import {
  notion,
  plainText,
  queryAll,
  together,
} from "~/lib/services/notion/client";
import {
  ARTICLES_DATA_SOURCE_ID,
  ARTICLE_PROPERTIES,
} from "~/lib/articles/config";
import {
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
  formula?: { type?: string; number?: number | null } | null;
};

type Page = { id: string; properties: Record<string, Property> };

function text(property: Property | undefined): string {
  return plainText(property?.title ?? property?.rich_text).trim();
}

/**
 * a formula property's number, or 0 when it does not have one.
 *
 * notion answers a number formula as `{ formula: { type: "number", number } }`
 * and a formula of any other type with no `number` at all — as does a property
 * the integration cannot read. Counting those as zero keeps a bad schema off
 * the screen as a missing badge rather than as `NaN contributions`
 */
function formulaNumber(property: Property | undefined): number {
  const value = property?.formula?.number;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
    status: status?.trim() || null,
    contributions: formulaNumber(
      page.properties?.[MEMBER_PROPERTIES.contributions.name],
    ),
  };
}

export async function people(token: string): Promise<Person[]> {
  return (await queryAll<Page>(MEMBERS_DATA_SOURCE_ID, token)).map(toPerson);
}

/**
 * the Status select's options, as notion currently has them.
 *
 * read rather than hardcoded so renaming an option is an edit in notion and
 * nothing else. `alumOptionMissing` is the guard on the one option a rule
 * depends on; an empty answer means the schema could not be read, and callers
 * fall back rather than offering nobody a status
 */
export async function statusOptions(token: string): Promise<string[]> {
  const schema = (await notion(
    `data_sources/${MEMBERS_DATA_SOURCE_ID}`,
    token,
  )) as {
    properties?: Record<
      string,
      { select?: { options?: { name?: string }[] } | null }
    >;
  };

  const options =
    schema.properties?.[MEMBER_PROPERTIES.status.name]?.select?.options ?? [];

  return options
    .map((option) => option.name?.trim())
    .filter((name): name is string => Boolean(name));
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
 * read by `standing.ts` alone, and it needs the dates: the counting there is
 * over a window, which Members' `Contributions` formula cannot express. The
 * kiosk's all-time badge comes from that formula instead, so this corpus is no
 * longer read to draw a screen.
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
 * add two round trips to every question an editor asks. `together` is what
 * keeps that from becoming a burst: these are four requests rather than three,
 * because `contributions` pages, and four in one tick is over notion's budget
 * before any of them has answered
 */
export async function corpus(token: string): Promise<Corpus> {
  const [read, met, wrote] = await together([
    () => people(token),
    () => meetings(token),
    () => contributions(token),
  ]);

  return { people: read, meetings: met, contributions: wrote };
}

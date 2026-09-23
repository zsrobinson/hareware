/* reading Members, Meetings and Articles into the shapes in `records.ts`. */

import {
  notion,
  plainText,
  queryAll,
  relationIds,
  together,
  type RelationProperty,
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
import { easternNow } from "~/lib/eastern";

type Property = RelationProperty & {
  type?: string;
  title?: { plain_text: string }[] | null;
  rich_text?: { plain_text: string }[] | null;
  email?: string | null;
  date?: { start?: string | null } | null;
  select?: { name?: string | null } | null;
  formula?: { type?: string; number?: number | null } | null;
};

export type Page = { id: string; properties: Record<string, Property> };

function text(property: Property | undefined): string {
  return plainText(property?.title ?? property?.rich_text).trim();
}

/**
 * a notion date's Eastern day, or `""`. Only a date with a time is converted:
 * a bare day has no instant. See silent-failures.md
 */
function easternDay(start: string | null | undefined): string {
  if (!start) return "";
  return start.includes("T") ? easternNow(new Date(start)).date : start;
}

/** a formula's number, or 0 when it has none (another type, or unreadable) */
function formulaNumber(property: Property | undefined): number {
  const value = property?.formula?.number;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** a relation's ids, whole, refusing one that is missing rather than empty */
async function relation(
  page: Page,
  name: string,
  owner: string,
  token: string,
): Promise<string[]> {
  const property = page.properties?.[name];
  if (!property || !Array.isArray(property.relation)) {
    throw new Error(
      `${owner}'s ${name} relation is not readable, so standing cannot be computed`,
    );
  }

  return relationIds(page.id, property, token);
}

export function toPerson(page: Page): Person {
  const status =
    page.properties?.[MEMBER_PROPERTIES.status.name]?.select?.name ?? null;
  const email = page.properties?.[MEMBER_PROPERTIES.email.name]?.email;

  return {
    pageId: page.id,
    name: text(page.properties?.[MEMBER_PROPERTIES.name.name]),
    /* never `""`: a row with no id is one that may be linked */
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

export async function member(token: string, pageId: string): Promise<Person> {
  return toPerson((await notion(`pages/${pageId}`, token)) as Page);
}

/** notion's live Status options. Throws when there is no Status select, as after a rename */
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
    schema.properties?.[MEMBER_PROPERTIES.status.name]?.select?.options;
  if (!options) {
    throw new Error(
      `Members has no readable ${MEMBER_PROPERTIES.status.name} select`,
    );
  }

  return options
    .map((option) => option.name?.trim())
    .filter((name): name is string => Boolean(name));
}

export async function meetings(token: string): Promise<MeetingRecord[]> {
  const pages = await queryAll<Page>(MEETINGS_DATA_SOURCE_ID, token);
  const records: MeetingRecord[] = [];

  for (const page of pages) {
    records.push({
      pageId: page.id,
      name: text(page.properties?.[MEETING_PROPERTIES.name.name]),
      date: easternDay(
        page.properties?.[MEETING_PROPERTIES.date.name]?.date?.start,
      ),
      type:
        page.properties?.[MEETING_PROPERTIES.type.name]?.select?.name ?? null,
      attendeeIds: await relation(
        page,
        MEETING_PROPERTIES.attendees.name,
        "a meeting",
        token,
      ),
    });
  }

  return records;
}

/**
 * every published Article's two credits. The window is not pushed into the
 * filter: standing asks over several ranges of the same corpus
 */
async function contributions(token: string): Promise<ContributionRecord[]> {
  const pages = await queryAll<Page>(ARTICLES_DATA_SOURCE_ID, token, {
    filter: {
      property: ARTICLE_PROPERTIES.publicationDate.name,
      date: { is_not_empty: true },
    },
  });
  const records: ContributionRecord[] = [];

  for (const page of pages) {
    records.push({
      pageId: page.id,
      headline: text(page.properties?.[ARTICLE_PROPERTIES.headline.name]),
      date: easternDay(
        page.properties?.[ARTICLE_PROPERTIES.publicationDate.name]?.date?.start,
      ),
      authorIds: await relation(
        page,
        ARTICLE_PROPERTIES.author.name,
        "an article",
        token,
      ),
      imageCrewIds: await relation(
        page,
        ARTICLE_PROPERTIES.imageCrew.name,
        "an article",
        token,
      ),
    });
  }

  return records;
}

export type Corpus = {
  people: Person[];
  meetings: MeetingRecord[];
  contributions: ContributionRecord[];
};

/** all three databases for standing, through `together` to stay inside notion's budget */
export async function corpus(token: string): Promise<Corpus> {
  const [read, met, wrote] = await together([
    () => people(token),
    () => meetings(token),
    () => contributions(token),
  ]);

  return { people: read, meetings: met, contributions: wrote };
}

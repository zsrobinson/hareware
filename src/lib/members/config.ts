/*
  the Members and Meetings databases, as they actually are.

  these constants used to live in `~/lib/articles/config`, beside Articles,
  because the only thing that read Members was a byline resolving to a person.
  ADR 0010 made Members a domain of its own — it now holds emails, a student
  status and an attendance history, none of which Articles has any opinion
  about — so the definitions moved to where the concept lives and Articles
  imports them.

  Meetings is described here rather than in `~/lib/automations/config` for the
  same reason. That file holds the *reminder's* settings: which channel, which
  hour, which role. The shape of a meeting row is not a reminder setting, and
  two features now read it.

  none of it is secret. a notion id is not a credential, and the token that
  reads them is.
*/

/** the Members data source — one row per person, ever */
export const MEMBERS_DATA_SOURCE_ID = "3cfbe415-e24c-8002-8e93-000b3e37e6c3";

/**
 * every Members property we read or write, and the type it must be.
 *
 * the type is here so a refresh can assert it rather than discover a mismatch
 * mid-write — the same contract `ARTICLE_PROPERTIES` carries, and for the same
 * reason: a relation whose target the integration cannot reach is omitted from
 * the schema entirely and reads back as `[]`, indistinguishable from empty.
 */
export const MEMBER_PROPERTIES = {
  name: { name: "Name", type: "title" },
  /* text, not number: a discord snowflake is 19 digits and loses its low
     digits to a float, silently, on every read */
  discordId: { name: "Discord ID", type: "rich_text" },
  /* notion's native `email`, not rich text. it validates on entry and writes
     as `{ email: "…" }` rather than a rich-text array */
  email: { name: "Email", type: "email" },
  status: { name: "Status", type: "select" },
  /** the other side of Meetings' `Attendees` */
  attendance: { name: "Attendance", type: "relation" },
} as const;

/**
 * where a member stands with the university.
 *
 * the only thing distinguishing an alum, because nothing else does: people do
 * not leave the server, and graduation year is deliberately not recorded — see
 * ADR 0010 on why a stored year is wrong more often than it is useful.
 *
 * spelled exactly as the select's options are in notion. a value that is not
 * one of these is read as unknown rather than coerced, because a typo'd status
 * silently granting or denying a vote is the failure this whole design exists
 * to avoid
 */
export const MEMBER_STATUSES = ["Undergrad", "Grad", "Alum"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** whether a status is one the club recognises */
export function isMemberStatus(value: string | null): value is MemberStatus {
  return (MEMBER_STATUSES as readonly string[]).includes(value ?? "");
}

/** the meetings database container; `data_sources/{id}` holds the rows */
export const MEETINGS_DATABASE_ID = "22cbe415e24c80299d53e9fa048f0ca5";

/**
 * the data source inside it.
 *
 * pinned rather than resolved on every call, the same way Articles is. the
 * meeting reminder still resolves it through `dataSource()` because it also
 * discovers which property holds the date, and changing that is not this
 * document's business
 */
export const MEETINGS_DATA_SOURCE_ID = "22cbe415-e24c-80d8-ba6b-000b75be27d3";

/** every Meetings property standing reads */
export const MEETING_PROPERTIES = {
  name: { name: "Name", type: "title" },
  date: { name: "Date", type: "date" },
  type: { name: "Type", type: "select" },
  /** the other side of Members' `Attendance` */
  attendees: { name: "Attendees", type: "relation" },
} as const;

/**
 * what kinds of meeting there are, spelled as notion spells them.
 *
 * `Editorial Board` is present and deliberately counts toward nothing. The
 * board attends those constantly, and counting them would make every officer
 * eligible by a route the constitution plainly did not intend — see ADR 0010.
 *
 * magazine design sessions have no type of their own. they are not a kind of
 * meeting anybody counts, so giving them one would imply otherwise
 */
export const MEETING_TYPES = [
  "General Body",
  "Volunteer Event",
  "Editorial Board",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export function isMeetingType(value: string | null): value is MeetingType {
  return (MEETING_TYPES as readonly string[]).includes(value ?? "");
}

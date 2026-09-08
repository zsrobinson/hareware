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
  /*
    notion's own `prop("Articles Count") + prop("Images Count")`, read so the
    kiosk can say "3 contributions" beside a name without this app reading the
    whole article corpus for it.

    all-time, and only ever that. a formula has no window, so it cannot answer
    the question `standing.ts` asks — see the note there
  */
  contributions: { name: "Contributions", type: "formula" },
  /** the other side of Meetings' `Attendees` */
  attendance: { name: "Attendance", type: "relation" },
  /*
    they are not to be added to the announcements group.

    somebody who leaves a mailing list on purpose is invisible to a comparison
    of who is in it: they look exactly like somebody who was never added, so
    every export would offer to add them back and one paste would do it. That
    is worse than a stale list — it is undoing a decision somebody made about
    their own inbox.

    a checkbox rather than a date or a note, because the club only ever needs
    the answer yes or no, and unticked is the safe default for every row that
    already exists
  */
  noAnnouncements: { name: "No Announcements", type: "checkbox" },
} as const;

/**
 * the one status the rules turn on.
 *
 * every other status is a label Notion owns and this code only prints — the
 * picker reads `properties.Status.select.options`, so renaming Undergrad needs
 * no deploy. This one is different: `standing.ts` excludes an alum from voting
 * by comparing against exactly this string, and a rename in Notion would
 * enfranchise alumni in an election with nothing to show for it. So the value
 * is named once, compared through the name, and checked against Notion's live
 * options by `alumOptionMissing` — which the standing page and the reconciler
 * say out loud rather than failing open.
 */
export const ALUM_STATUS = "Alum";

/**
 * the status a new member gets before anybody chooses one.
 *
 * spelled out rather than taken from the head of Notion's options, because
 * Notion currently returns them as `['Alum', 'Undergrad', 'Grad']` and
 * defaulting to the first would file every person who signs themselves in at
 * the kiosk as an alum — which `standing.ts` reads as ineligible to vote, with
 * nothing on any screen to say so.
 */
export const DEFAULT_MEMBER_STATUS = "Undergrad";

/**
 * which of Notion's live options a new member starts on.
 *
 * `DEFAULT_MEMBER_STATUS` where Notion still has it, and otherwise the first
 * option that is not the alum one: a renamed Undergrad must not become a
 * default that disenfranchises. Options holding nothing but alumni select
 * nothing at all rather than that.
 */
export function defaultStatus(options: string[]): string | null {
  if (options.includes(DEFAULT_MEMBER_STATUS)) return DEFAULT_MEMBER_STATUS;

  return options.find((option) => option !== ALUM_STATUS) ?? null;
}

/**
 * what to offer when Notion's schema could not be read.
 *
 * a fallback, not the vocabulary. `ALUM_STATUS` is spelled through the
 * constant so the two cannot drift
 */
export const FALLBACK_MEMBER_STATUSES = ["Undergrad", "Grad", ALUM_STATUS];

/** whether Notion's live options still contain the value the alum rule tests */
export function alumOptionMissing(options: string[]): boolean {
  return options.length > 0 && !options.includes(ALUM_STATUS);
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

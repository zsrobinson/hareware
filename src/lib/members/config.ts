/* the Members and Meetings databases. A notion id is not a secret. */

/** one row per person, ever */
export const MEMBERS_DATA_SOURCE_ID = "3cfbe415-e24c-8002-8e93-000b3e37e6c3";

/** every Members property read or written, and its notion type */
export const MEMBER_PROPERTIES = {
  name: { name: "Name", type: "title" },
  /* text: a 19-digit snowflake loses its low digits as a float */
  discordId: { name: "Discord ID", type: "rich_text" },
  email: { name: "Email", type: "email" },
  status: { name: "Status", type: "select" },
  /* a notion formula, all-time: standing's windowed counts cannot use it */
  contributions: { name: "Contributions", type: "formula" },
  /** the other side of Meetings' `Attendees` */
  attendance: { name: "Attendance", type: "relation" },
  articles: { name: "Articles", type: "relation" },
  images: { name: "Images", type: "relation" },
} as const;

/**
 * the one status a rule turns on: `standing.ts` excludes alumni from voting by
 * this string. The others are notion's labels. Renaming it in notion would
 * include every alum, which `alumOptionMissing` exists to flag
 */
export const ALUM_STATUS = "Alum";

/** named rather than notion's first option, which is currently `Alum` */
export const DEFAULT_MEMBER_STATUS = "Undergrad";

/** the status a new member starts on: the default if notion has it, else any but alum */
export function defaultStatus(options: string[]): string | null {
  if (options.includes(DEFAULT_MEMBER_STATUS)) return DEFAULT_MEMBER_STATUS;

  return options.find((option) => option !== ALUM_STATUS) ?? null;
}

/** what to offer when notion's schema could not be read */
export const FALLBACK_MEMBER_STATUSES = ["Undergrad", "Grad", ALUM_STATUS];

/** whether Notion's live options still contain the value the alum rule tests */
export function alumOptionMissing(options: string[]): boolean {
  return options.length > 0 && !options.includes(ALUM_STATUS);
}

/**
 * the Meetings data source. `databases/{id}` holds no rows and has no query
 * endpoint; the data source inside it does
 */
export const MEETINGS_DATA_SOURCE_ID = "22cbe415-e24c-80d8-ba6b-000b75be27d3";

/** every Meetings property read or written */
export const MEETING_PROPERTIES = {
  name: { name: "Name", type: "title" },
  date: { name: "Date", type: "date" },
  type: { name: "Type", type: "select" },
  attendees: { name: "Attendees", type: "relation" },
} as const;

/** the meeting `Type` options, as notion spells them. Editorial Board counts toward nothing (ADR 0010) */
export const MEETING_TYPE = {
  generalBody: "General Body",
  volunteer: "Volunteer Event",
  editorialBoard: "Editorial Board",
} as const;
export type MeetingType = (typeof MEETING_TYPE)[keyof typeof MEETING_TYPE];

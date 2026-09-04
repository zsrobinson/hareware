/*
  every knob the reminders have, as constants rather than a settings database.
  these change about once a year — the meeting time, the roster — and a one-line
  pull request is a cheaper way to change them than a config store nobody
  remembers exists. see ADR 0006
*/

/**
 * the hour, eastern, at which the daily reminders go out.
 *
 * the cron ticks hourly and `run.ts` acts on the tick whose eastern hour is
 * this one, so the value must be an hour that happens exactly once a day. 1 is
 * the one to avoid: clocks go back at 2am on the first sunday of november, so
 * eastern 1am comes round twice and every reminder would fire twice with it.
 * 2 disappears entirely on the march transition for the same reason
 */
export const REMINDER_HOUR = 8;

/** @Weekend Poster covers both saturday and sunday, so two days share it */
const WEEKEND_POSTER = "1545245632996966493";

/**
 * the duty roster: which discord role covers instagram on which day.
 *
 * discord roles rather than a notion property, so whoever runs social can edit
 * the roster with Manage Roles and the bot's only job is a mention. keyed by
 * the weekday names `Intl` produces in `~/lib/eastern`
 */
export const SOCIAL_ROLE_IDS: Record<string, string | undefined> = {
  Monday: "1545245444588961943",
  Tuesday: "1545245519415087124",
  Wednesday: "1545245547307212880",
  Thursday: "1545245586276483175",
  Friday: "1545245612310794310",
  Saturday: WEEKEND_POSTER,
  Sunday: WEEKEND_POSTER,
};

/**
 * where hareware itself is served, for the "open in hareware" buttons.
 *
 * a cron tick has no incoming request to read an origin from, so it has to be
 * written down. leave it undefined and the social ping still goes out, just
 * without the buttons — they are a convenience, not the point of the message
 */
export const HAREWARE_ORIGIN: string | undefined =
  "https://hareware.zsrobinson.com";

/**
 * the role the meeting reminder pings — @Editorial Board.
 *
 * set REMINDERS_NO_PING while testing rather than clearing this: the mention
 * still renders, so the message looks exactly as it will, and nobody's phone
 * goes off
 */
export const MEETING_MENTION_ROLE_ID: string | undefined = "669611068938780673";

/**
 * the notion database holding one page per editorial board meeting.
 *
 * this is NOT the Articles database — the reminder looks for a page whose date
 * property is today and links its agenda, which Articles has no notion of
 */
export const MEETINGS_DATABASE_ID: string | undefined =
  "22cbe415e24c80299d53e9fa048f0ca5";

/**
 * which meetings the reminder is for, matched against the start of a meeting's
 * title.
 *
 * the database holds editorial board meetings, general body meetings and the
 * occasional magazine design session, and nothing distinguishes them but their
 * name — there is no kind property to filter on. adding a select property in
 * notion would be more robust than matching prose, and this is the constant to
 * delete on the day someone does
 */
export const MEETING_TITLE_PREFIX = "Editorial Board";

/**
 * the date property on that database carrying the meeting's day.
 *
 * left undefined it is discovered from the schema — a meetings database has
 * exactly one property of type `date`, and finding it beats hardcoding a name
 * that breaks silently the day someone renames the column. set it only if a
 * second date property ever appears and the wrong one gets picked
 */
export const MEETING_DATE_PROPERTY: string | undefined = undefined;

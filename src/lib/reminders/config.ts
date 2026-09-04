/*
  every knob the reminders have, as constants rather than a settings database.
  these change about once a year — the meeting time, the roster — and a one-line
  pull request is a cheaper way to change them than a config store nobody
  remembers exists. see ADR 0006
*/

/** the hour, eastern, at which the daily reminders go out */
export const REMINDER_HOUR = 8;

/**
 * the duty roster: which discord role covers instagram on which day.
 *
 * seven roles rather than a notion property, so whoever runs social can edit it
 * with Manage Roles and the bot's only job is a mention. fill these in with the
 * role ids from discord (Developer Mode → right-click the role → Copy ID)
 */
export const SOCIAL_ROLE_IDS: Record<string, string | undefined> = {
  Sunday: undefined,
  Monday: undefined,
  Tuesday: undefined,
  Wednesday: undefined,
  Thursday: undefined,
  Friday: undefined,
  Saturday: undefined,
};

/**
 * where hareware itself is served, for the "open in hareware" buttons.
 *
 * a cron tick has no incoming request to read an origin from, so it has to be
 * written down. leave it undefined and the social ping still goes out, just
 * without the buttons — they are a convenience, not the point of the message
 */
export const HAREWARE_ORIGIN: string | undefined = undefined;

/** the notion database holding one page per editorial board meeting */
export const MEETINGS_DATABASE_ID: string | undefined = undefined;

/** the date property on that database carrying the meeting's day */
export const MEETING_DATE_PROPERTY = "Date";

/* The reminder's settings, as constants: a one-line pull request is a cheaper
   way to change them than a store nobody remembers exists. */

/** Eastern. Not 1 or 2: DST makes 1am happen twice and 2am not at all. */
export const REMINDER_HOUR = 8;

export const SOCIAL_CHANNEL_ID = "1155994296219091014"; // #instagram-posting

/**
 * where a failed run is reported: the bot-noise channel, not one the club reads
 */
export const ALERT_CHANNEL_ID = "1029929430652555364"; // #carl-bot

const WEEKEND_POSTER = "1545245632996966493";

/**
 * which Discord role covers Instagram each day, keyed by `~/lib/eastern`'s
 * weekday
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
 * for links in cron messages, which have no request to take an origin from;
 * optional
 */
export const HAREWARE_ORIGIN: string | undefined =
  "https://hareware.zsrobinson.com";

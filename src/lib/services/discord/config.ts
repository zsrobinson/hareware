/*
  The Discord application, which posts, receives interactions and is the OAuth
  client. None of these is secret; DISCORD_BOT_TOKEN is.
*/

/** also the OAuth client id */
export const DISCORD_APPLICATION_ID = "1544938808611573760";

/** Ed25519, hex */
export const DISCORD_PUBLIC_KEY =
  "0cf79c0e160ab39cacd8320fb5915f5292a73ab53f4d0d6508a0ca87c32a5f0d";

/** The Hare */
export const GUILD_ID = "669610151011155999";

/** @Editorial Board — who may reach the admin tools */
export const EDITORIAL_BOARD_ROLE_ID = "669611068938780673";

/** the names `defuse()` writes in place of a mention, for REMINDERS_NO_PING */
export const ROLE_NAMES: Record<string, string> = {
  "669611068938780673": "Editorial Board",
  "1545245444588961943": "Monday Poster",
  "1545245519415087124": "Tuesday Poster",
  "1545245547307212880": "Wednesday Poster",
  "1545245586276483175": "Thursday Poster",
  "1545245612310794310": "Friday Poster",
  "1545245632996966493": "Weekend Poster",
};

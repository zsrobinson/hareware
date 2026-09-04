/*
  the discord application. one of them does everything: it posts both reminders,
  receives the button presses, and is the oauth client members sign in through.

  none of these is a secret. the application id is public and is also the oauth
  client id, the guild and role ids are visible to anyone in the server, and the
  public key exists precisely to be published — it verifies discord's signature
  and cannot produce one.

  the secret is DISCORD_BOT_TOKEN, which is read at runtime by everything: it
  sends every message and reads the roles the admin pages gate on
*/

/**
 * one application does everything: it posts the reminders, receives the button
 * presses, and is the oauth client members sign in through. its id is also the
 * oauth client id, which is why there is only one of these
 */
export const DISCORD_APPLICATION_ID = "1544938808611573760";

/** ed25519 public key from the developer portal, hex, 32 bytes */
export const DISCORD_PUBLIC_KEY =
  "0cf79c0e160ab39cacd8320fb5915f5292a73ab53f4d0d6508a0ca87c32a5f0d";

/** The Hare */
export const GUILD_ID = "669610151011155999";

/** @Editorial Board — who may reach the admin tools */
export const EDITORIAL_BOARD_ROLE_ID = "669611068938780673";

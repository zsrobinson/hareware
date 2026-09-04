/*
  the discord application, as opposed to the plain channel webhooks the
  reminders started on. neither of these is a secret: the application id is
  public, and the public key exists precisely to be published — it verifies
  discord's signature and cannot produce one.

  the bot token is the secret, and nothing here reads it: it exists only to
  create the webhooks the application owns, which is a thing done by hand when a
  reminder moves channel. the readme's "recreating the discord webhooks" has the
  procedure, and it is the reason DISCORD_BOT_TOKEN need not be deployed at all
*/

/** the bot: it posts the reminders and receives the button presses */
export const DISCORD_APPLICATION_ID = "1544938808611573760";

/**
 * the oauth client, which is a *different* application.
 *
 * sign-in was built against one application and the bot against another, so
 * these are not the same id however much they look like they should be. one
 * application could do both — the redirect urls would move to the bot's — and
 * that is worth doing the next time somebody is in the developer portal
 */
export const DISCORD_OAUTH_CLIENT_ID = "1542247642468319372";

/** ed25519 public key from the developer portal, hex, 32 bytes */
export const DISCORD_PUBLIC_KEY =
  "0cf79c0e160ab39cacd8320fb5915f5292a73ab53f4d0d6508a0ca87c32a5f0d";

/** The Hare */
export const GUILD_ID = "669610151011155999";

/** @Editorial Board — who may reach the admin tools */
export const EDITORIAL_BOARD_ROLE_ID = "669611068938780673";

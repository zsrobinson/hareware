/*
  the discord application, as opposed to the plain channel webhooks the
  reminders started on. neither of these is a secret: the application id is
  public, and the public key exists precisely to be published — it verifies
  discord's signature and cannot produce one. the bot token is the secret, and
  lives in DISCORD_BOT_TOKEN
*/

export const DISCORD_APPLICATION_ID = "1544938808611573760";

/** ed25519 public key from the developer portal, hex, 32 bytes */
export const DISCORD_PUBLIC_KEY =
  "0cf79c0e160ab39cacd8320fb5915f5292a73ab53f4d0d6508a0ca87c32a5f0d";

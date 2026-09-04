/// <reference path="../.astro/types.d.ts" />
/// <reference types="@astrojs/cloudflare/types.d.ts" />

/*
  the worker's secrets, merged into the `Env` that `wrangler types` generates
  from wrangler.jsonc. they are optional because the reminders are
  meant to be inert until they are supplied — a missing url skips that reminder
  and says so in the log, rather than throwing on every cron tick
*/
interface Env {
  /** channel webhook for #social-media */
  DISCORD_SOCIAL_WEBHOOK_URL?: string;
  /** channel webhook for the editorial board channel */
  DISCORD_BOARD_WEBHOOK_URL?: string;
  /** notion internal integration token, read-only on the Meetings database */
  NOTION_TOKEN?: string;
}

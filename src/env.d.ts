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

  /*
    the discord application's bot token. only needed to create the webhooks the
    application owns — a webhook made by hand in discord's ui belongs to nobody
    and may not carry interactive components. the application id and public key
    are not secrets and live in ~/lib/discord/config
  */
  DISCORD_BOT_TOKEN?: string;

  /*
    the two below exist so the reminders can be exercised on demand. set them
    in `.dev.vars` and never as deployed secrets — `wrangler secret list` is
    the place to check that, since a stray REMINDERS_IGNORE_HOUR in production
    would fire every reminder once an hour, all day
  */

  /** run the reminders whatever the hour, rather than only at REMINDER_HOUR */
  REMINDERS_IGNORE_HOUR?: string;
  /** log what would be sent to discord instead of sending it */
  REMINDERS_DRY_RUN?: string;
  /** post as normal but notify nobody, so a real send is not an annoyance */
  REMINDERS_NO_PING?: string;
}

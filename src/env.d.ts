/// <reference path="../.astro/types.d.ts" />
/// <reference types="@astrojs/cloudflare/types.d.ts" />

/**
 * Everything the worker reads from its environment.
 *
 * Two kinds live here. **Secrets** are set with `npx wrangler versions secret
 * put <NAME>` and belong in production; plain `wrangler secret put` refuses
 * unless the latest version happens to be the deployed one. **Switches** are
 * for exercising the reminders and belong in `.dev.vars` only — every one of
 * them changes behaviour in a way nobody wants running unattended.
 *
 * Every value is optional. A reminder whose secret is missing returns a line
 * saying which one and does nothing, so the worker runs clean with none of
 * them set and starts working the moment they appear. Nothing here throws.
 *
 * Settings that are not secret — the duty roster's role ids, the Meetings
 * database id, the reminder hour, HareWare's own origin — are constants in
 * `~/lib/reminders/config`, not variables. They change about once a year and a
 * one-line pull request is a cheaper way to change them than a store nobody
 * remembers exists.
 */
interface Env {
  /* ---- secrets ---------------------------------------------------------- */

  /**
   * Application-owned webhook for `#instagram-posting`, where the social duty
   * reminder posts. Must be created by the application: a webhook made by hand
   * in Discord's UI cannot carry the Mark as Posted button, and Discord rejects
   * the whole message rather than dropping the component. See the README.
   */
  DISCORD_SOCIAL_WEBHOOK_URL?: string;

  /** Application-owned webhook for `#editorial-board`. Same rule as above. */
  DISCORD_BOARD_WEBHOOK_URL?: string;

  /**
   * Notion internal integration token. Needs read access to the Meetings
   * database and nothing else — the Articles database is never read or written
   * by anything here, per ADR 0006.
   */
  NOTION_TOKEN?: string;

  /**
   * The Discord bot token. **Not read at runtime**, and does not need to be a
   * deployed secret: it exists only to create the application-owned webhooks by
   * hand when a reminder moves channel. The README carries that procedure.
   */
  DISCORD_BOT_TOKEN?: string;

  /* ---- switches, for .dev.vars only -------------------------------------- */

  /**
   * Log the Discord payload instead of sending it. The safest way to see what a
   * reminder would say.
   */
  REMINDERS_DRY_RUN?: string;

  /**
   * Post as normal but notify nobody: empties `allowed_mentions` and nothing
   * else, so `<@&…>` still renders and the message looks exactly as the real
   * one will. Better than clearing a role id, which changes the message and is
   * easy to forget to put back.
   */
  REMINDERS_NO_PING?: string;

  /**
   * Run both reminders on every tick rather than only at `REMINDER_HOUR`.
   *
   * Deployed, this posts both reminders **once an hour, all day**. It is the
   * single most damaging variable here.
   */
  REMINDERS_IGNORE_HOUR?: string;

  /**
   * Run the meeting reminder on the next tick whatever the hour, leaving the
   * social ping on its normal schedule.
   *
   * Deployed, this is how a reminder is exercised in production without waiting
   * for the morning — but a Worker has no "on deploy" hook, so it takes effect
   * on the next hourly tick and **keeps firing every hour until removed**. It
   * says so in the log each time. Remove it once you have seen the message.
   */
  REMINDERS_FORCE_MEETING?: string;

  /** As above, for the social ping. Same warning: it repeats hourly. */
  REMINDERS_FORCE_SOCIAL?: string;
}

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
interface HareWareEnv {
  /* ---- bindings ---------------------------------------------------------- */

  /**
   * The invocation log, and nothing else. Optional so that everything keeps
   * working when it is absent — a missing log is not a reason to stop posting.
   */
  DB?: D1Database;

  /* ---- secrets ---------------------------------------------------------- */

  /**
   * Notion internal integration token. Needs read access to the Meetings
   * database and nothing else — the Articles database is never read or written
   * by anything here, per ADR 0006.
   */
  NOTION_TOKEN?: string;

  /**
   * Guards `POST /api/reminders/run`, which fires the reminders by hand so one
   * can be seen without waiting for 8am. Sent as `Authorization: Bearer …`.
   *
   * Unlike the switches below this one belongs in production, and is safe
   * there: it triggers a single run rather than standing state, so nothing
   * repeats if it is forgotten. Leave it unset and the route answers 404.
   *
   * Generate with `openssl rand -hex 32`.
   */
  REMINDERS_TRIGGER_SECRET?: string;

  /**
   * Signs the session cookie and the OAuth state cookie, and nothing else.
   *
   * Rotating it signs everybody out, which is the only way to revoke a session
   * — see `~/lib/session` for why there is no store to delete from.
   *
   * Generate with `openssl rand -hex 32`.
   */
  SESSION_SECRET?: string;

  /**
   * The Discord application's OAuth client secret, used once per sign-in to
   * exchange the code for an access token. The client *id* is not secret and
   * is a constant in `~/lib/discord/config`.
   */
  DISCORD_CLIENT_SECRET?: string;

  /**
   * The Discord bot token. Both reminders post as the bot, so this is what
   * sends every message.
   *
   * The channels themselves are not secret and are constants in
   * `~/lib/reminders/config`, so moving a reminder is a one-line change rather
   * than a credential to rotate.
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
   * Post both reminders to this channel instead of their real ones.
   *
   * The channels are constants, so without this a local run would post to the
   * club's actual channels. Never set it in production.
   */
  REMINDERS_TEST_CHANNEL?: string;

  /**
   * Run both reminders on every tick rather than only at `REMINDER_HOUR`.
   *
   * Deployed, this posts both reminders **once an hour, all day**. It is the
   * single most damaging variable here.
   */
  REMINDERS_IGNORE_HOUR?: string;
}

/*
  `Env` is what a worker handler is handed; `Cloudflare.Env` is what
  `cloudflare:workers` types its `env` export as. astro v6 removed
  `locals.runtime.env` — the getter now exists only to throw — so routes read
  the module, and both names have to carry these
*/
interface Env extends HareWareEnv {}

declare namespace Cloudflare {
  interface Env extends HareWareEnv {}
}

/** the tag or short hash this was built from — see `version()` in astro.config */
declare const __APP_VERSION__: string;

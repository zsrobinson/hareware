# Silent failures

The traps in this codebase that report success. Each one here cost real time,
and none is discoverable by reading the config — the API returns `200`, the
build goes green, the tests pass, and the thing you wanted did not happen.

Read this before changing anything that talks to Discord, Notion, or the
deployed Worker.

The habit all of them argue for: **verify, don't infer.** Every entry below was
first diagnosed wrongly from a plausible guess, and settled by going and
looking. When you find yourself reasoning about what an API did, go and ask it.

## Discord

**A role mention renders whether or not it notified anyone.** Discord draws
`<@&id>` as a pill regardless, and only highlights it for people it actually
reached. A reminder mentioning `@Editorial Board` in grey has been posted,
rendered, and dropped on the way to everyone in it. The bot needs **Mention
@everyone, @here, and All Roles**, or the role must be Mentionable. Webhooks are
exempt from this, which is why the pings worked before the switch to posting as
the bot and stopped after it, with no code change to blame.

**`allowed_mentions` does not gate a mention inside a Components V2 text
display.** An empty `roles` array notifies the role exactly as though the field
were absent. The only way not to ping is not to write the markup —
`defuse()` in `src/lib/discord/post-message.ts` is that, and it is why
`REMINDERS_NO_PING` rewrites the text rather than clearing a field.

**A button missing `custom_id` invalidates the whole message.** Discord refuses
to render it rather than dropping the button, so an interaction response that
strips `custom_id` while editing a message shows the user "HareWare didn't
respond in time" — even though the endpoint returned `200` with a body Discord
read. `togglePosted()` keeps the id for this reason.

## Notion

**A database is not where the rows are.** `databases/{id}` returns an empty
`properties` and there is no `databases/{id}/query`. Resolve
`data_sources[0].id` first and query `data_sources/{id}/query`.

**Date filters compare to millisecond precision and assume UTC.**
`date: { equals: "2026-09-10" }` means midnight, so it matches nothing once a
meeting has a time on it — and the Meetings database holds both kinds, so this
fails on half the rows and looks like "no meeting today". Query a window wide
enough to hold the Eastern day under any offset and filter in code, as
`findTodaysMeeting()` does.

**A date with no time carries no instant.** Notion writes it as a bare
`YYYY-MM-DD`. Running that through a timezone parses it as UTC midnight and
lands it on the previous evening, so a meeting with no time set is missed every
time. `startsOn()` compares those as strings and only converts the ones with a
`T` in them.

## Cloudflare and Astro

**Cron triggers are UTC and do not observe DST.** The pattern here is an hourly
tick with an Eastern hour gate — see `easternNow()` and `REMINDER_HOUR`. Check
any new schedule against both 2am transition days: an Eastern hour can occur
twice or not at all.

**A deploy does not take effect when `wrangler deploy` returns.** A request
issued straight afterwards is often served by the previous version, which reads
exactly like the change not working. Poll until the response proves the new code
is live before concluding anything about it.

**`locals.runtime.env` was removed in Astro v6.** Its getter now exists only to
throw. Read `import { env } from "cloudflare:workers"` instead.

**`wrangler types` reads `.dev.vars`.** Whatever is in that untracked file is
added to the generated `Env`, so a variable can type check on one machine and
nowhere else. `SESSION_SECRET` and `DISCORD_CLIENT_SECRET` were typed this way
for weeks. Every variable the code reads belongs in `HareWareEnv` in
`src/env.d.ts`.

## Testing against the real thing

`#instagram-posting` and `#editorial-board` are the club's real channels, and
the channel ids are compiled into `src/lib/reminders/config.ts` rather than
supplied per environment — so a local run with no other setting posts to them
for real. Messages can be deleted; the pings they send cannot be taken back.

Set `REMINDERS_TEST_CHANNEL` in `.dev.vars` before running anything that posts.

Against production, `POST /api/automations/run?dry=1` reports what each reminder
would post without posting it, and `?silent=1` posts without notifying. Neither
`REMINDERS_DRY_RUN` nor `REMINDERS_NO_PING` is set in production, deliberately,
so that the real 8am run works — which means an unqualified manual trigger is a
real post to a real channel.

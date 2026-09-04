# HareWare

The in-house tooling for [The Hare](https://theumdhare.com): a set of tools that
turn published articles into Instagram posts, InDesign copy and newsletter
content, plus a bot that posts the club's recurring reminders into Discord. The
tools are open to anyone and need no account.

HareWare does **not** integrate with the article tracker. That lives in Notion,
is maintained by hand, and is read by people rather than by software — see
[ADR 0006](docs/adr/0006-hareware-is-a-reminder-bot.md) for why, and read it
before proposing that HareWare should track articles.

Shared vocabulary lives in [CONTEXT.md](CONTEXT.md) and the decisions behind the
shape of it in [docs/adr](docs/adr).

## Development

```sh
npm install
npm run dev
```

`npm run dev` runs the app in workerd, the same runtime Cloudflare serves it
with, via the adapter's Vite plugin.

### When workerd will not start

workerd's allocator assumes a 48-bit userspace address space. Raspberry Pi's
64-bit kernel gives it 39 (`CONFIG_ARM64_VA_BITS=39`), so on a Pi it aborts
before it can start. This takes out `npm run dev`, `npm run preview` and
`wrangler dev --remote` alike — remote mode is no way around it, because it
still runs a local workerd to proxy through. It is a property of the machine
rather than of this project: see
[workerd#5020](https://github.com/cloudflare/workerd/issues/5020).

Building, typechecking and deploying are all unaffected. On such a machine,
check your work against a preview deployment instead of a dev server:

```sh
npm run build
npx wrangler versions upload   # uploads a version, prints a preview url
```

## Deployment

Pushes deploy through Cloudflare Workers Builds. `npm run deploy` publishes from
a terminal when you need it.

## Reminders

A Cloudflare Cron Trigger runs `scheduled()` in `src/worker.ts` every hour. The
reminders decide for themselves whether a given tick is their hour, because
Cloudflare crons are UTC with no timezone setting and both reminders mean 8am
Eastern — see `src/lib/eastern.ts`.

- **Social duty** — if anything published on theumdhare.com today, posts it to
  `#instagram-posting` and pings that day's poster role.
- **Board meeting** — if the Notion Meetings database holds a meeting dated
  today, posts a link to its agenda page.

Neither posts anything on a day with nothing to say.

### Environment

Every value below is optional, and nothing throws when one is missing: a
reminder whose secret is absent returns a line naming it and does nothing. The
worker runs clean with none of them set.

Set them with `npx wrangler versions secret put <NAME>`. Plain
`wrangler secret put` refuses unless the latest version happens to be the
deployed one, which it usually is not.

| Secret                       | What it is                                                      |
| ---------------------------- | --------------------------------------------------------------- |
| `DISCORD_SOCIAL_WEBHOOK_URL` | Application-owned webhook for `#instagram-posting`              |
| `DISCORD_BOARD_WEBHOOK_URL`  | Application-owned webhook for `#editorial-board`                |
| `NOTION_TOKEN`               | Notion integration token, read access to Meetings only          |
| `DISCORD_BOT_TOKEN`          | **Not read at runtime.** Creates the webhooks above — see below |

#### Switches, for `.dev.vars` only

These exist to exercise the reminders. Each changes behaviour in a way nobody
wants running unattended, and none belongs in a deployed secret.

| Switch                    | What it does                                                 |
| ------------------------- | ------------------------------------------------------------ |
| `REMINDERS_DRY_RUN`       | Log the Discord payload instead of sending it                |
| `REMINDERS_NO_PING`       | Post as normal but notify nobody — the mention still renders |
| `REMINDERS_IGNORE_HOUR`   | Run both reminders on every tick, not just at 8am            |
| `REMINDERS_FORCE_MEETING` | Run the meeting reminder on the next tick, whatever the hour |
| `REMINDERS_FORCE_SOCIAL`  | The same, for the social ping                                |

`REMINDERS_IGNORE_HOUR` is the most damaging of these if it reaches production:
a Worker cannot unset its own environment, so it would post both reminders once
an hour, all day, until somebody noticed. To fire a reminder in production, use
the manual trigger below instead — it runs once and leaves nothing behind.

#### Firing a reminder by hand

`POST /api/reminders/run` runs the reminders immediately, so one can be seen
without waiting for 8am. It takes the same path the cron takes, so there is no
second implementation to drift.

```sh
curl -X POST -H "Authorization: Bearer $REMINDERS_TRIGGER_SECRET" \
  "https://hareware.zsrobinson.com/api/reminders/run"
```

Add `?only=meeting` or `?only=social` to fire just one. The response is a line
per reminder saying what it did. It is a `POST` because it posts to Discord, and
the secret travels in a header rather than the URL, which Cloudflare logs.

Without `REMINDERS_TRIGGER_SECRET` set, the route answers `404` — the trigger
does not exist rather than standing open.

#### Not variables

The duty roster's role ids, the Meetings database id, the reminder hour,
HareWare's own origin, and the Discord application id and public key are
constants in `src/lib/reminders/config.ts` and `src/lib/discord/config.ts`.
None of them is secret, and they change about once a year — a one-line pull
request is a cheaper way to change them than a store nobody remembers exists,
and it leaves a reviewable history of what changed and why.

`npm test` needs none of the above and touches no network.
`npm run reminders:send` posts real messages using `.dev.vars`, and the shell
overrides the file, so `REMINDERS_DRY_RUN= npm run reminders:send` sends for
real.

### Setup outside the repo

1. **Discord roles.** Create `@Social Sunday` through `@Social Saturday` and
   assign them. Copy each role's ID (Settings → Advanced → Developer Mode, then
   right-click the role → Copy ID) into `SOCIAL_ROLE_IDS`.
2. **Discord webhooks.** They must be created by the application rather than
   by hand — see [Recreating the Discord webhooks](#recreating-the-discord-webhooks)
   below.

3. **Notion.** Create an internal integration at
   [notion.so/my-integrations](https://www.notion.com/my-integrations) and copy
   its token. Then open the Meetings database, and under `⋯` → Connections add
   that integration — Notion connections are opt-in per database, so the token
   reads nothing until you do. Read access is all it needs. Put the database's
   ID into `MEETINGS_DATABASE_ID`.
4. **HareWare's own origin.** Set `HAREWARE_ORIGIN` to wherever this app is
   deployed. A cron tick has no incoming request to read an origin from, so it
   has to be written down. Left unset, the social reminder still goes out — it
   just omits the "open in HareWare" buttons.
5. **WordPress.** Nothing. The social reminder reads the public feed and needs
   no account, token or plugin.

## Recreating the Discord webhooks

The reminders post through webhooks **the application owns**. This is not a
preference: only an application-owned webhook may carry an interactive
component, so a webhook created by hand in Discord's UI can post the reminders
but silently costs you the **Mark as Posted** button — Discord answers `400` to
the whole message rather than dropping just the button.

You need this procedure to move a reminder to a different channel, or if a
webhook is ever deleted from the server.

### What the bot needs

The `HareWare` bot must have **View Channel** and **Manage Webhooks** in the
channel. It does not need Send Messages: it never speaks as itself, it only
creates the webhook that does. Permission changes take a minute or so to reach
every Discord node, so a `403` immediately after granting them usually means
"try again shortly" rather than "wrong permission".

### Creating one

`DISCORD_BOT_TOKEN` is only ever used for this. It is deliberately not read at
runtime, and does not need to exist as a deployed secret.

```sh
curl -X POST \
  -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"HareWare"}' \
  "https://discord.com/api/v10/channels/<channel id>/webhooks"
```

The response holds `id` and `token`; the URL is
`https://discord.com/api/webhooks/<id>/<token>`. Put it in the matching secret
with `npx wrangler versions secret put <NAME>` — plain `secret put` refuses
unless the latest version happens to be the deployed one.

### Reading one back

The token is in the webhook object, so a URL never has to be written down —
only its id:

```sh
curl -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  "https://discord.com/api/v10/webhooks/<webhook id>"
```

| Channel              | Purpose                        | Webhook id            |
| -------------------- | ------------------------------ | --------------------- |
| `#instagram-posting` | social duty reminder           | `1545273547033935954` |
| `#editorial-board`   | board meeting reminder         | `1545273549147602944` |
| `#carl-bot`          | local testing, via `.dev.vars` | `1545273550837911624` |

### One trap worth knowing

**Discord rejects requests carrying the default `User-Agent` of some HTTP
clients** — Python's `urllib` among them — with a `403` that reads exactly like
a permissions failure. `curl` and `fetch` are fine. If a call fails with `403`
while the same call from `curl` succeeds, this is why, and no amount of
adjusting channel permissions will fix it.

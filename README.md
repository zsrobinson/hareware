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

| Switch                    | What it does                                                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| `REMINDERS_DRY_RUN`       | Log the Discord payload instead of sending it                                     |
| `REMINDERS_NO_PING`       | Post as normal but notify nobody — writes the role's name in place of the mention |
| `REMINDERS_IGNORE_HOUR`   | Run both reminders on every tick, not just at 8am                                 |
| `REMINDERS_FORCE_MEETING` | Run the meeting reminder on the next tick, whatever the hour                      |
| `REMINDERS_FORCE_SOCIAL`  | The same, for the social ping                                                     |

`REMINDERS_IGNORE_HOUR` is the most damaging of these if it reaches production:
a Worker cannot unset its own environment, so it would post both reminders once
an hour, all day, until somebody noticed. To fire a reminder in production, use
the manual trigger below instead — it runs once and leaves nothing behind.

#### Firing a reminder by hand

`POST /api/reminders/run` runs the reminders immediately, so one can be seen
without waiting for 8am. It takes the same path the cron takes, so there is no
second implementation to drift.

```sh
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $REMINDERS_TRIGGER_SECRET" \
  "https://hareware.zsrobinson.com/api/reminders/run"
```

The content type is not optional. Astro rejects a cross-site `POST` that looks
like a form submission, and a request carrying no content type at all counts —
without that header the answer is `403 Cross-site POST form submissions are
forbidden`, from Astro rather than from this route.

| Parameter                        | What it does                                    |
| -------------------------------- | ----------------------------------------------- |
| `?only=meeting` / `?only=social` | Fire one rather than both                       |
| `?dry=1`                         | Report what each would post, without posting it |
| `?silent=1`                      | Post, but notify nobody                         |

The response is a line per reminder saying what it did. It is a `POST` because
it posts to Discord, and the secret travels in a header rather than the URL,
which Cloudflare logs.

**Use `?dry=1` the first time.** Production deliberately carries neither
`REMINDERS_DRY_RUN` nor `REMINDERS_NO_PING`, so that a real 8am run posts and
pings properly — which means an unqualified trigger posts to
`#instagram-posting` and `#editorial-board` for real and pings the roles. These
parameters exist because that is easy to forget, and they apply to one request
rather than standing until somebody removes them.

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

## Moving a reminder to another channel

Both reminders post **as the bot**, so a channel is not a credential: the ids
are constants in `src/lib/reminders/config.ts` and moving one is a one-line
pull request. The bot needs **View Channel** and **Send Messages** in the new
channel.

This is why there are no webhooks. A webhook would make the message author a
dead end — webhooks are not users, so clicking the name shows no profile — need
its own avatar rather than the one set in the developer portal, and turn every
channel into a URL that is a credential to create, store and rotate.

Set `REMINDERS_TEST_CHANNEL` in `.dev.vars` while working on what the reminders
say. Without it a local run posts to the club's real channels, because the ids
are compiled in rather than supplied per environment.

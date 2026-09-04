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

## Worker types

`worker-configuration.d.ts` is 590KB of runtime declarations generated from
`wrangler.jsonc`. It is gitignored and written by the `postinstall` hook, so
`npm ci` is all a clone needs.

Run `npm run types` after changing a binding — or any time the type checker
starts claiming `D1Database` and `cloudflare:workers` do not exist, which is
what a missing one looks like.

**It reads `.dev.vars` too**, adding whatever it finds there to `Env`. That
means a secret you have locally can type check here and nowhere else, so every
variable the code reads belongs in `HareWareEnv` in `src/env.d.ts` — the
generated file is not a declaration you can rely on.

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

| Secret                     | What it is                                                          |
| -------------------------- | ------------------------------------------------------------------- |
| `DISCORD_BOT_TOKEN`        | Sends every reminder, and reads the roles the admin pages gate on   |
| `NOTION_TOKEN`             | Notion integration token, read access to Meetings only              |
| `SESSION_SECRET`           | Signs the session and OAuth-state cookies. `openssl rand -hex 32`   |
| `DISCORD_CLIENT_SECRET`    | The OAuth client secret, exchanged once per sign-in                 |
| `REMINDERS_TRIGGER_SECRET` | Guards `POST /api/automations/run`. Unset, that route answers `404` |

`DISCORD_BOT_TOKEN` is the one nothing works without: both reminders post as the
bot, and the admin pages ask Discord for the caller's roles on every request.

#### Switches, for `.dev.vars` only

These exist to exercise the reminders. Each changes behaviour in a way nobody
wants running unattended, and none belongs in a deployed secret.

| Switch                   | What it does                                                                      |
| ------------------------ | --------------------------------------------------------------------------------- |
| `REMINDERS_DRY_RUN`      | Log the Discord payload instead of sending it                                     |
| `REMINDERS_NO_PING`      | Post as normal but notify nobody — writes the role's name in place of the mention |
| `REMINDERS_IGNORE_HOUR`  | Run both reminders on every tick, not just at 8am                                 |
| `REMINDERS_TEST_CHANNEL` | Send both reminders here instead of the club's real channels                      |

`REMINDERS_IGNORE_HOUR` is the most damaging of these if it reaches production:
a Worker cannot unset its own environment, so it would post both reminders once
an hour, all day, until somebody noticed. To fire a reminder in production, use
the manual trigger below instead — it runs once and leaves nothing behind.

#### Firing a reminder by hand

`POST /api/automations/run` runs the reminders immediately, so one can be seen
without waiting for 8am. It takes the same path the cron takes, so there is no
second implementation to drift.

```sh
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $REMINDERS_TRIGGER_SECRET" \
  "https://hareware.zsrobinson.com/api/automations/run"
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

#### When a run fails

A failed **cron** run posts to `#carl-bot` naming the reminder and the reason.
Deliberately not `#editorial-board`: a reminder that did not go out is an
operational fact, and putting it beside the reminders themselves trains everyone
to scroll past both.

It reports a failure only when the previous recorded run of that reminder
succeeded, so a reminder broken for a week says so once and then goes quiet. It
speaks up again after a run that worked — which is also what "recovered, then
broke again" looks like from the log. With no history to compare against, it
reports: a missing log is a reason to say more rather than less.

A reminder fired **by hand** reports nothing, because the response already
carries the error to whoever triggered it.

The alert never pings a role, and never throws — a reminder that posted
correctly must not be recorded as failed because the alert could not be sent.

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
2. **Discord bot.** Invite the application with **View Channel** and **Send
   Messages** in `#instagram-posting` and `#editorial-board`, and give its role
   **Mention @everyone, @here, and All Roles** — without that last one the
   reminders post and ping nobody, silently. See
   [Why a ping renders but does not notify](#why-a-ping-renders-but-does-not-notify).
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

## Why a ping renders but does not notify

A role mention can look right and reach nobody. Discord draws `<@&id>` as a pill
whether or not the mention was allowed, and only highlights it for the people it
actually notified — so a reminder that mentions `@Editorial Board` in grey has
been posted, rendered, and silently dropped on the way to everyone in it.

There are two ways a role becomes pingable, and the bot needs one of them:

- the role is **Mentionable** in its Discord settings, which also lets every
  member ping it, or
- the **HareWare** role holds **Mention @everyone, @here, and All Roles**, which
  lets the bot ping a role that nobody else can.

The second is the one to use. It keeps `@Editorial Board` unpingable by hand,
which is what a duty role should be, and `allowed_mentions` in
`src/lib/discord/post-message.ts` still names the single role each message may
mention, so the permission is broad but the message is not.

This bites bots only. The reminders posted through webhooks at first, and a
webhook pings any role listed in `allowed_mentions` without needing the
permission at all — so the pings worked before the switch to posting as the bot
and stopped afterwards, with nothing in the code changing to explain it.

This is why there are no webhooks. A webhook would make the message author a
dead end — webhooks are not users, so clicking the name shows no profile — need
its own avatar rather than the one set in the developer portal, and turn every
channel into a URL that is a credential to create, store and rotate.

Set `REMINDERS_TEST_CHANNEL` in `.dev.vars` while working on what the reminders
say. Without it a local run posts to the club's real channels, because the ids
are compiled in rather than supplied per environment.

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
  `#social-media` and pings that day's `@Social <Day>` role.
- **Board meeting** — if the Notion Meetings database holds a meeting dated
  today, posts a link to its agenda page.

Neither posts anything on a day with nothing to say.

### Secrets

Set with `npx wrangler secret put <NAME>`, and in a local `.dev.vars` for
development. **Every one of them is optional**: a reminder whose secret is unset
logs that it was skipped and does nothing, so the worker runs fine without any
of them.

| Name                         | What it is                                      |
| ---------------------------- | ----------------------------------------------- |
| `DISCORD_SOCIAL_WEBHOOK_URL` | Channel webhook for `#social-media`             |
| `DISCORD_BOARD_WEBHOOK_URL`  | Channel webhook for the editorial board channel |
| `NOTION_TOKEN`               | Notion internal integration token, read-only    |

Non-secret settings — the duty roster's role IDs, the Meetings database ID, the
reminder hour, and the origin HareWare itself is served from — are constants in
`src/lib/reminders/config.ts`. They change
about once a year, and a one-line pull request is a cheaper way to change them
than a settings store nobody remembers exists.

### Setup outside the repo

1. **Discord roles.** Create `@Social Sunday` through `@Social Saturday` and
   assign them. Copy each role's ID (Settings → Advanced → Developer Mode, then
   right-click the role → Copy ID) into `SOCIAL_ROLE_IDS`.
2. **Discord webhooks.** In each of `#social-media` and the board channel,
   Settings → Integrations → Webhooks → New Webhook, and copy the URL. The URL
   is the whole credential: it can post to that one channel and do nothing else.
   There is no bot, no application and no OAuth.
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

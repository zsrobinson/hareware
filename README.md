# HareWare

The in-house tooling for [The Hare](https://theumdhare.com):

- **Public tools** that turn published articles into Instagram posts, InDesign
  copy and newsletter content. Open to anyone, no account needed.
- **A social reminder** that posts each morning's new articles to
  `#instagram-posting` and pings that day's poster.
- **An archive viewer** for the Editorial Board: Articles and People, each with
  its views as tabs (tables, charts and pivots), and Problems, over every published
  post, with real names in place of pseudonyms.

WordPress is the record of what the club published. HareWare reads it and keeps
no copy. The one fact WordPress does not hold, who is really behind a
pseudonymous byline, lives in a small Google Sheet owned by the club's account.
[ADR 0011](docs/adr/0011-wordpress-is-the-record.md) has the reasoning.

Shared vocabulary is in [CONTEXT.md](CONTEXT.md), and the decisions behind the
design are in [docs/adr](docs/adr).

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
`wrangler dev --remote` alike — remote mode still runs a local workerd to proxy
through. See [workerd#5020](https://github.com/cloudflare/workerd/issues/5020).

Building, typechecking and deploying are unaffected. On such a machine, check
your work against a preview deployment instead:

```sh
npm run build
npx wrangler@4.149.0 preview   # builds a Preview of this branch, prints its url
```

A push does the same: every non-`main` branch is built as a Worker Preview at
`<branch>.hareware.zsrobinson.com`, with the Preview settings rather than
production's (see AGENTS.md). `beta.hareware.zsrobinson.com` follows one
chosen branch; AGENTS.md says how to choose another.

## Worker types

`worker-configuration.d.ts` is the runtime declarations generated from
`wrangler.jsonc`. It is gitignored and written by the `postinstall` hook, so
`npm ci` is all a clone needs.

Run `npm run types` after changing a binding, or whenever the type checker
claims `D1Database` and `cloudflare:workers` do not exist.

Every variable the code reads belongs in `HareWareEnv` in `src/env.d.ts`
(`docs/agents/silent-failures.md` says why).

## Deployment

Pushes to `main` deploy through Cloudflare Workers Builds. `npm run deploy` publishes from
a terminal when you need it.

## The archive

`/articles`, `/people`, `/problems` and `/settings` read every published post from
the public REST API, parse the credit lines out of each one, and apply the
Sheet, all in the browser (ADR 0012). The server keeps nothing: the browser
keeps its read of WordPress for up to a day and checks it for new articles
after ten minutes, and asks for the Sheet on every load and never keeps it.

A credit line is a short paragraph that starts with a known label and a colon:
`Article by: …`, `Image Credits: …`. The names after it are split on commas,
`and` and `&`. `X, as told to Y` and `X (Translated by Y)` credit Y. Any other
parenthesis, and anything starting in lower case, is set aside rather than
counted. Typos in a name are fixed in WordPress, not aliased here; Problems
points at names a letter or two apart, and at lines shaped like a credit that
no label matches.

People are counted in **contributions**: one person in one role on one
article, so writing and illustrating an article is two.

### The Sheet

HareWare reads the Sheet on every load and writes it from the signed-in pages:
who a byline is on one article from Articles (many at once from Settings),
ignored problems from Problems, credit labels from Settings. Nobody needs to
open it in normal use, and HareWare adds any tab it is missing the first time
it saves there. Each tab is read by its header row, so columns can be in any
order.

| Tab         | Columns                                          | Meaning                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Overrides` | `post_id`, `role`, `byline`, `real_name`, `note` | A printed `byline` counts as `real_name` on the article `post_id`, in `role` or, blank, any role. A row with a `role` but no byline adds someone the article does not print. Every row names an article ([ADR 0013](docs/adr/0013-pen-names-per-article.md)); a row with no `post_id` counts nowhere, and Settings lists it to set on its articles or remove. |
| `Labels`    | `label`, `role`                                  | Which paragraph labels start a credit line, and whether each credits `writer`, `image` or `other`. Empty, the defaults in `src/lib/credits/labels.ts` apply.                                                                                                                                                                                                  |
| `Ignored`   | `post_id`, `names`, `note`                       | Articles whose problems are intended, or a pair of similar names that are different people.                                                                                                                                                                                                                                                                   |

A save reads the tab, changes the rows it means to, and writes the tab back,
keeping every other row as it was. Two people saving at once is
last-writer-wins.

**What is in the Sheet is private.** It never goes into WordPress, the
repository, the log or a public page. The archive pages are empty shells; the
APIs that hold the data refuse anybody without `@Editorial Board`, and log
lines for
Sheet changes name the kind of change and the post id, never a person.

Setting it up: a Google Cloud service account, with the Sheets API enabled on
its project, shared on the Sheet as **Editor**. Its JSON key goes in
`GOOGLE_SERVICE_ACCOUNT_KEY` whole, and the Sheet's id in `GOOGLE_SHEET_ID`.

## The social reminder

A Cloudflare Cron Trigger runs `scheduled()` in `src/worker.ts` every hour.
Cloudflare crons are UTC with no timezone setting, so the reminder decides
whether a given tick is 8am Eastern — see `src/lib/eastern.ts`.

At 8am it asks WordPress for everything published since 8am the day before and,
if there is anything, posts it to `#instagram-posting` with that day's poster
role. A post scheduled for after 8am is announced the next morning. A quiet day
posts nothing and records that it did not. `/reminder` shows what the next run
would announce so far, and every run since.

Automations are listed in `src/lib/automations/registry.ts`, which is also what
dispatches them.

### Environment

Every value below is optional, and nothing throws when one is missing: a page
or reminder whose secret is absent says which one and does nothing.

Set them as **secrets**, with `npx wrangler versions secret put <NAME>` or as
type _Secret_ in the dashboard. A dashboard _variable_ is dropped by the next
deploy, because wrangler replaces variables with the ones in `wrangler.jsonc`.
Plain `wrangler secret put` refuses unless the latest version happens to be the
deployed one, which it usually is not.

| Secret                       | What it is                                                              |
| ---------------------------- | ----------------------------------------------------------------------- |
| `DISCORD_BOT_TOKEN`          | Sends the reminder, and reads the roles the gated APIs check            |
| `SESSION_SECRET`             | Signs the session and OAuth-state cookies. `openssl rand -hex 32`       |
| `DISCORD_CLIENT_SECRET`      | The OAuth client secret, exchanged once per sign-in                     |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | The service account's whole JSON key file                               |
| `GOOGLE_SHEET_ID`            | The Sheet's id, from its url. A secret because the repository is public |
| `REMINDERS_TRIGGER_SECRET`   | Guards `POST /api/automations/run`. Unset, that route answers `404`     |

#### Switches, for `.dev.vars` only

These exist to exercise the reminder. None belongs in a deployed secret.

| Switch                   | What it does                                                                      |
| ------------------------ | --------------------------------------------------------------------------------- |
| `REMINDERS_DRY_RUN`      | Log the Discord payload instead of sending it                                     |
| `REMINDERS_NO_PING`      | Post as normal but notify nobody — writes the role's name in place of the mention |
| `REMINDERS_IGNORE_HOUR`  | Run the reminder on every tick, not just at 8am                                   |
| `REMINDERS_TEST_CHANNEL` | Send the reminder here instead of `#instagram-posting`                            |

`REMINDERS_IGNORE_HOUR` does the most damage if it reaches production: the
Worker would post every hour until somebody removed it.

#### Firing the reminder by hand

`POST /api/automations/run` runs the reminder immediately, through the same path
the cron takes.

```sh
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $REMINDERS_TRIGGER_SECRET" \
  "https://hareware.zsrobinson.com/api/automations/run?dry=1"
```

The content type is required: Astro rejects a cross-site `POST` that looks like
a form submission. `?dry=1` reports what it would post without posting, and
`?silent=1` posts but notifies nobody. **Use `?dry=1` the first time**: an
unqualified trigger posts to `#instagram-posting` for real.

#### When a run fails

A failed **cron** run posts to `#carl-bot` naming the reason, once per streak of
failures. A run fired by hand reports nothing, because the response already
carries the error.

#### Not variables

Channel and role ids, the guild id, the reminder hour, HareWare's own origin, and
the Discord application id and public key are constants in
`src/lib/automations/config.ts` and `src/lib/services/discord/config.ts`. They
change about once a year, so a one-line pull request is a cheaper way to change
them than a store nobody remembers.

### Setup outside the repo

1. **Discord roles.** One poster role per weekday and one for the weekend, ids in `SOCIAL_ROLE_IDS`.
2. **Discord bot.** **View Channel** and **Send Messages** in
   `#instagram-posting` and `#carl-bot`, and **Mention @everyone, @here, and All
   Roles** — without it the reminder posts and pings nobody, silently. See
   [Making the bot able to ping](#making-the-bot-able-to-ping).
3. **The Sheet.** See [The Sheet](#the-sheet).
4. **WordPress.** Nothing: everything read is public.

## Making the bot able to ping

A role mention can render perfectly and reach nobody — the trap is described in
[docs/agents/silent-failures.md](docs/agents/silent-failures.md). A role becomes
pingable in one of two ways:

- mark the role **Mentionable**, which also lets every member ping it, or
- give the **HareWare** role **Mention @everyone, @here, and All Roles**, which
  lets the bot ping a role nobody else can.

Use the second, so the poster roles stay unpingable by hand.

That permission is broad, so the narrowing happens in the message. `inert()` in
`src/lib/services/discord/post-message.ts` strips mention markup from every
headline before it goes into a message, so the only mention
that survives is the one we wrote. `allowed_mentions` is set too, but does not
gate a mention inside a Components V2 text display.

The bot posts as itself rather than through channel webhooks. A webhook author
has no profile to click, needs its own avatar, and turns every channel into a
URL that is a credential to create, store and rotate.

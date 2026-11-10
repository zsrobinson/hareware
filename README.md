# HareWare

The publishing tools and Editorial Board archive for
[The Hare](https://theumdhare.com), the University of Maryland’s satirical
newspaper. Use it at **[hareware.zsrobinson.com](https://hareware.zsrobinson.com)**.

HareWare brings together:

- **Public tools** that turn published articles into Instagram posts, InDesign
  copy and newsletter content. Open to anyone, no account needed.
- **A social reminder** that posts each morning's new articles to
  `#instagram-posting` and pings that day's poster.
- **An archive viewer** for the Editorial Board: Articles and People, each with
  its views as tabs (tables, charts and pivots) that the board saves and shares,
  and Problems, over every published post, with real names in place of
  pseudonyms.

WordPress is the record of what the club published. HareWare reads published
articles live and keeps no server-side copy. The one fact WordPress does not
hold, who is really behind a
pseudonymous byline, lives in a small Google Sheet owned by the club's account,
beside the board's views of the archive.
[ADR 0011](docs/adr/0011-wordpress-is-the-record.md) and
[ADR 0015](docs/adr/0015-views-are-shared-in-the-sheet.md) have the reasoning.

Shared vocabulary is in [CONTEXT.md](CONTEXT.md), and the decisions behind the
design are in [docs/adr](docs/adr).

## What changed in v3

- **One published archive.** WordPress replaces the former Notion tracker.
  Articles, People and Problems connect published work to private credit
  corrections, with per-article pen names, labels, confirmation and Undo.
- **Explore the question, then the records.** Tables, charts and pivots share
  filters, exact-person search and links. Open the articles or contributions
  behind a count, compare periods, and follow retention by semester since joining.
  Copy a table or download CSV without losing its scope.
- **Shared views.** Start with the supplied views, customize them, then use
  **Save for everyone**. The board can create, rename, reorder and delete views
  in HareWare; they live in the Sheet rather than requiring a code change.
  Unsaved edits can be Reset, and conflicting saves offer reload or overwrite.
- **Words and readership.** Explore article word counts and lifetime Jetpack
  views. Missing, incomplete and too-new readership counts are explained rather
  than silently treated as zero.
- **One interface.** Public tools and board pages share navigation, responsive
  forms and panels. Compact tabs, keyboard focus and phone layouts received a
  final polish. UI chrome is monochrome; the logo and exported graphics keep
  their original brand colors.

The full release is [v3.0.0](https://github.com/zsrobinson/hareware/releases/tag/v3.0.0).
`beta.hareware.zsrobinson.com` now redirects to production with a **302**, keeping
its path and query. It is no longer a separate public testing destination.

## Development

Use **Node 24**, as recorded in `.nvmrc`, and npm:

```sh
npm ci
npm run dev
```

`npm ci` installs the lockfile and generates Worker types through `postinstall`.
Local secrets belong in the ignored `.dev.vars`; only the features that need
those secrets require them. See [Environment](#environment).

`npm run dev` runs the app in workerd, the same runtime Cloudflare serves it
with, via the adapter's Vite plugin.

### When workerd will not start

workerd's allocator assumes a 48-bit userspace address space. Raspberry Pi's
64-bit kernel gives it 39 (`CONFIG_ARM64_VA_BITS=39`), so on a Pi it aborts
before it can start. This takes out `npm run dev`, `npm run preview` and
`wrangler dev --remote` alike — remote mode still runs a local workerd to proxy
through. See [workerd#5020](https://github.com/cloudflare/workerd/issues/5020).

Building, typechecking and tests are unaffected. Use the branch Preview
created by Workers Builds after a push; a local runtime reinstall does not fix
the kernel’s address-space limit.

### Checks

GitHub’s `Verify` check runs the type checker, ESLint, tests and formatting.
Cloudflare’s separate `Workers Builds: hareware` check runs `npm run build`
(type checking and the production bundle) and deploys the Preview.

```sh
npm run types
node node_modules/astro/bin/astro.mjs check
npm run lint
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=30000
npm run format:check
npm run build
```

On the shared Pi, run one heavy command at a time and lint only the files you
changed, using `node node_modules/eslint/bin/eslint.js <files>`. Keep the two
worker limit and 30-second test timeout. The live reminder test command,
`npm run reminders:send`, is separate from the ordinary suite and can send real
Discord messages; it is not a routine validation command.

## Worker types

`worker-configuration.d.ts` is the runtime declarations generated from
`wrangler.jsonc`. It is gitignored and written by the `postinstall` hook, so
`npm ci` is all a clone needs.

Run `npm run types` after changing a binding, or whenever the type checker
claims `D1Database` and `cloudflare:workers` do not exist.

Every variable the code reads belongs in `HareWareEnv` in `src/env.d.ts`
(`docs/agents/silent-failures.md` says why).

## Deployment

Changes reach protected `main` through pull requests. Both **Verify** and
**Workers Builds: hareware** must pass. Cloudflare Workers Builds builds and
deploys pushes to `main` to [production](https://hareware.zsrobinson.com);
GitHub Actions validates changes but does not deploy them.

Each non-`main` branch gets a Worker Preview at
`<branch>.hareware.zsrobinson.com` (slashes become hyphens). Previews have their
own session secret but share the real Sheet and invocation log with production.
They run no crons, and without a trigger secret their manual reminder endpoint
returns 404. Treat saves there as real board edits.

The shared beta hostname is currently redirected by the Cloudflare zone rule
**HareWare beta off: send beta to production**. That rule, not a git branch,
controls the redirect. The named beta Preview can still exist behind it; changing
which branch supplies it is a separate, explicit operation described in
[AGENTS.md](AGENTS.md).

`npm run deploy` is an authenticated manual publish command, not the normal
release pipeline. No local deployment credentials are needed to contribute
through a PR.

### Releases

Releases use GitHub releases and `vX.Y.Z` tags, such as `v3.0.0`, on the merged
commit. The sidebar’s build version comes from git tags and the commit hash
through `src/lib/build-version.mjs`; `package.json`’s `0.0.1` is not the product
release number. There is no separate release workflow or changelog file.

## The archive

`/articles`, `/people`, `/problems` and `/settings` read every published post from
the public REST API through the cached `/api/wordpress` pass-through, parse the
credit lines out of each one, and apply the Sheet, all in the browser (ADR 0012). The server keeps nothing: the browser
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
article, so writing and illustrating an article is two. Articles also carry
their **words**, counted from the body as it is read, and their **views**,
from Jetpack Stats through the gated `/api/stats`; a chart or pivot of either
sums the articles it lists, and views that could not be read are
unavailable, never zero.

### The Sheet

HareWare reads the Sheet on every load and writes it from the signed-in pages:
who a byline is on one article from Articles (many at once from Settings),
ignored problems from Problems, credit labels from Settings, and views from
Articles and People. Nobody needs to
open it in normal use, and HareWare adds any tab it is missing the first time
it saves there. Each tab is read by its header row, so columns can be in any
order.

| Tab         | Columns                                                      | Meaning                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Overrides` | `post_id`, `role`, `byline`, `real_name`, `note`             | A printed `byline` counts as `real_name` on the article `post_id`, in `role` or, blank, any role. A row with a `role` but no byline adds someone the article does not print. Every row names an article ([ADR 0013](docs/adr/0013-pen-names-per-article.md)); a row with no `post_id` counts nowhere, and Settings lists it to set on its articles or remove. |
| `Labels`    | `label`, `role`                                              | Which paragraph labels start a credit line, and whether each credits `writer`, `image` or `other`. Empty, the defaults in `src/lib/credits/labels.ts` apply.                                                                                                                                                                                                  |
| `Ignored`   | `post_id`, `names`, `note`                                   | Articles whose problems are intended, or a pair of similar names that are different people.                                                                                                                                                                                                                                                                   |
| `Views`     | `id`, `page`, `position`, `view`, `updated by`, `updated at` | Each page's views, in `position` order. `view` is the declaration as JSON with `"v": 1`; a row HareWare cannot read is listed in Settings. A page with no rows shows its starter set from `src/components/archive/views.ts`, which the first change there writes ([ADR 0015](docs/adr/0015-views-are-shared-in-the-sheet.md)).                                |

A save reads the tab, changes the rows it means to, and writes the tab back,
keeping every other row as it was. Two people saving at once is
last-writer-wins, except on `Views`, where a save based on a copy someone has
changed since is refused, and the page offers to reload or overwrite.

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

Set them as type **Secret** in the dashboard, or use
`node node_modules/wrangler/bin/wrangler.js versions secret put <NAME>`.
A dashboard _variable_ is dropped by the next deploy, because wrangler replaces
variables with the ones in `wrangler.jsonc`.
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
| `WORDPRESS_STATS_USER`       | The WordPress account the archive reads Jetpack's view counts as        |
| `WORDPRESS_STATS_PASSWORD`   | That account's application password, sent as Basic auth                 |

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
4. **WordPress.** Published articles need no credentials. Jetpack readership
   needs a WordPress administrator’s application password in the two stats
   secrets above. Only allow-listed stats reads are passed through the gated API.

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

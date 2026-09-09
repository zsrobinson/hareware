# HareWare

The in-house tooling for [The Hare](https://theumdhare.com): a set of tools that
turn published articles into Instagram posts, InDesign copy and newsletter
content, a bot that posts the club's recurring reminders into Discord, and the
pages that work out who has standing to vote. The article tools are open to
anyone and need no account; the membership pages are for the Editorial Board.

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

## Automations

A Cloudflare Cron Trigger runs `scheduled()` in `src/worker.ts` every hour. The
reminders decide for themselves whether a given tick is their hour, because
Cloudflare crons are UTC with no timezone setting and both reminders mean 8am
Eastern — see `src/lib/eastern.ts`.

- **Social duty** — if anything published on theumdhare.com today, posts it to
  `#instagram-posting` and pings that day's poster role.
- **Board meeting** — if the Notion Meetings database holds a meeting dated
  today, posts a link to its agenda page.
- **Member applications** — creates a Notion `Members` row for each approved
  Discord application that matches nobody already on the roster. This one runs
  **every hour** rather than at 8am, and posts nothing: somebody who applies on
  Wednesday afternoon has to autocomplete at Wednesday evening's meeting.

The two reminders post nothing on a day with nothing to say.

### Environment

Every value below is optional, and nothing throws when one is missing: a
reminder whose secret is absent returns a line naming it and does nothing. The
worker runs clean with none of them set.

Set them with `npx wrangler versions secret put <NAME>`. Plain
`wrangler secret put` refuses unless the latest version happens to be the
deployed one, which it usually is not.

| Secret                     | What it is                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `DISCORD_BOT_TOKEN`        | Sends every reminder, reads the roles the admin pages gate on, and reads the join-request applications |
| `NOTION_TOKEN`             | Notion integration token. Reads Meetings, Members and Articles, and writes Members and attendance      |
| `SESSION_SECRET`           | Signs the session and OAuth-state cookies. `openssl rand -hex 32`                                      |
| `DISCORD_CLIENT_SECRET`    | The OAuth client secret, exchanged once per sign-in                                                    |
| `REMINDERS_TRIGGER_SECRET` | Guards `POST /api/automations/run`. Unset, that route answers `404`                                    |

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

| Parameter                                             | What it does                                        |
| ----------------------------------------------------- | --------------------------------------------------- |
| `?only=meeting`, `?only=social`, `?only=applications` | Fire one rather than all                            |
| `?dry=1`                                              | Report what each would post, without posting it     |
| `?silent=1`                                           | Post, but notify nobody                             |
| `?sync=1`                                             | Re-register the commands from Notion; fires nothing |

The response is a line per reminder saying what it did. It is a `POST` because
it posts to Discord, and the secret travels in a header rather than the URL,
which Cloudflare logs.

**Use `?dry=1` the first time.** Production deliberately carries neither
`REMINDERS_DRY_RUN` nor `REMINDERS_NO_PING`, so that a real 8am run posts and
pings properly — which means an unqualified trigger posts to
`#instagram-posting` and `#editorial-board` for real and pings the roles. These
parameters exist because that is easy to forget, and they apply to one request
rather than standing until somebody removes them.

`?sync=1` is the exception to all of that. It re-reads Notion's schema and
registers the command surface it implies, and returns **without firing a
reminder** — a caller forcing a resync is not asking to ping the club. Use it
when a change to the sync needs exercising rather than waiting up to an hour for
the next tick.

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
constants in `src/lib/automations/config.ts` and `src/lib/services/discord/config.ts`.
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
   It also needs **Manage Server**, **Kick Members** and the **Server Members**
   privileged intent for the membership pages — see
   [Discord setup](#discord-setup).
3. **Notion.** Create an internal integration at
   [notion.so/my-integrations](https://www.notion.com/my-integrations) and copy
   its token. Then open the Meetings database, and under `⋯` → Connections add
   that integration — Notion connections are opt-in per database, so the token
   reads nothing until you do. Put the database's ID into
   `MEETINGS_DATABASE_ID`. Connect `Members` and `Articles` the same way for the
   membership pages, which need write access as well — see
   [Notion setup](#notion-setup).
4. **HareWare's own origin.** Set `HAREWARE_ORIGIN` to wherever this app is
   deployed. A cron tick has no incoming request to read an origin from, so it
   has to be written down. Left unset, the social reminder still goes out — it
   just omits the "open in HareWare" buttons.
5. **WordPress.** Nothing. The social reminder reads the public feed and needs
   no account, token or plugin.

## Membership and standing

Three pages answer one question the club actually has to get right: **who may
vote**. The constitution's rule is that within the past year somebody attended
3 general body meetings, or made 2 contributions, or worked 1 volunteer event.
Nothing stores an "eligible" flag — the answer is computed from records every
time it is asked for. See
[ADR 0010](docs/adr/0010-standing-is-computed.md) for the reasoning.

- **`/attendance`** is a kiosk. It sits on a laptop at the front of the room,
  people type their own names, and it writes attendance onto the meeting in
  Notion. Somebody the roster has never heard of is created from the name and
  email they type. Every row can have its Discord account, email and status
  corrected on the spot, by the person it is about.
- **`/reconciler`** holds everything that needs a human: applications that could
  match more than one row, rows that look like the same person twice, members
  with no status, members already in the Discord whose row is not linked, and
  the Google Group comparison. Run it before an election — a duplicate splits
  somebody's attendance across two rows and can cost them a vote they earned.
- **`/standing`** computes eligibility over any window and thresholds, with the
  constitution's rule as a preset, and exports CSV for TerpLink.

### Notion setup

The `Members` and `Meetings` databases both need connecting to the integration
(`⋯` → Connections), the same way Meetings already is for the reminders.

`Meetings` needs:

| Property    | Type                                                         |
| ----------- | ------------------------------------------------------------ |
| `Type`      | Select: `General Body`, `Editorial Board`, `Volunteer Event` |
| `Attendees` | Relation to `Members`, two-way with its `Attendance`         |

**Set `Type` on the rows that already exist.** Only `General Body` and
`Volunteer Event` count toward standing, and a meeting with no type counts
toward nothing — the kiosk says so on screen rather than filing attendance that
turns out not to count.

`Members` needs:

| Property           | Type                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `Status`           | Select. Its options are Notion's to name, except `Alum`, which the voting rule excludes on |
| `Attendance`       | The other side of Meetings' `Attendees`                                                    |
| `Contributions`    | Formula: `prop("Articles Count") + prop("Images Count")`                                   |
| `No Announcements` | Checkbox. Ticked for somebody who asked not to be in the email group                       |

Renaming a `Status` option needs no deploy — the pickers read the live schema.
Removing `Alum` does need one, and the reconciler says so in red if it goes
missing, because with it gone nobody is excluded from a vote as an alum.

### Discord setup

The bot reads the join-request applications people fill in to enter the server,
which is where the cleanest name and email the club has come from.

Give the bot's role **Kick Members** — Discord's own name for it in the role
editor is "Kick, approve, and reject members". That is the permission
[member applications](https://support.discord.com/hc/en-us/articles/29729107418519-Server-Member-Applications)
are gated behind, and it is required to _read_ the list as well as to act on it.

**Without it, the endpoint does not refuse — it answers `200` with `{}`.** No
list, no count, no error. Every other endpoint returns a clean `403`:
`/guilds/{id}/bans` and `/guilds/{id}/audit-logs` both do. This one does not, so
a check that only looks at the status code reports success while the roster
quietly stops growing. This cost us a day. `approvedApplications` now refuses an
answer carrying neither a list nor a count, and names this permission in the
error, which surfaces on the reconciler and in the `#carl-bot` alert.

Membership screening with manual approval has to stay switched on. There is no
webhook when an editor approves somebody, which is why the sync polls, and it
reads the whole approved list every time rather than keeping a cursor — a stored
position that slips past a gap never revisits it.

### The Google Group

The announcements group cannot be read or written by software: the Admin SDK
wants Workspace administrator credentials on the domain that owns the group, and
the club's is owned by a consumer Gmail account. So the reconciler compares it by
hand instead.

Open the group's members, use its **Export CSV** button, and hand the file to
the reconciler. It reads the file in the browser — the addresses are never
uploaded anywhere — and says who on the roster is missing, who has no address at
all, and which addresses in the group match nobody. Copy the missing ones into
the group's bulk-add field.

Nothing is remembered between times, so the answer is right on every run rather
than depending on somebody having pressed a button last time. Somebody who
leaves the group on purpose looks exactly like somebody never added, so tick
**No Announcements** on their row and the comparison stops offering them.

Addresses outside `terpmail.umd.edu` and `umd.edu` are flagged: Google does not
auto-add those, and they need an invitation instead.

## Editor commands

`/article` lets the Editorial Board change an Article without opening Notion.
See [ADR 0009](docs/adr/0009-editor-commands-in-discord.md) for why it exists
and how it stays current.

The command's choices for Article Status, Section and Image Status come from
Notion's schema, so **adding or removing a status is something the club does in
Notion** and nothing here has to change. Discord bakes those choices into the
registration rather than resolving them when somebody opens the picker, so the
surface is registered again every hour. Discord allows two hundred
registrations a day and this uses twenty-four, which is why it simply re-registers
rather than remembering what it last sent.

### Setting it up

Two things, both one-time.

**1. Grant the role.** Commands register with `default_member_permissions: "0"`,
which hides them from everybody. In **Server Settings → Integrations → HareWare
→ Commands**, add an override granting `/article` to `@Editorial Board`.

That override is a default and not the boundary: anyone who reaches the command
another way is still refused at runtime, ephemerally. It survives later
registrations, so this is done once.

**2. Keep Members shared with the integration.** Notion omits a relation
property from a schema entirely when it cannot reach the target, and its value
then reads back as `[]` rather than as missing. Lose that access and an author
write looks like it succeeded against an empty field. The code refuses rather
than writes, but the failure is silent from Notion's side.

### How the picker stays current

Autocomplete reads Notion directly — the hundred most recently edited Articles,
one request — and matches them here, because Notion cannot express a fuzzy
search. A snapshot is held in the Worker's memory for ten seconds so that a
burst of keystrokes costs one request rather than six; Notion allows about
three a second.

Nothing is cached in a database. There was an index in D1, kept current by a
webhook, a write-through and an hourly rebuild, and ADR 0009 records why it went.

## Moving an automation to another channel

Both reminders post **as the bot**, so a channel is not a credential: the ids
are constants in `src/lib/automations/config.ts` and moving one is a one-line
pull request. The bot needs **View Channel** and **Send Messages** in the new
channel.

## Making the bot able to ping

A role mention can render perfectly and reach nobody — the trap, and how to
recognise it, is in
[docs/agents/silent-failures.md](docs/agents/silent-failures.md). What setup
needs is the choice between the two ways a role becomes pingable:

- mark the role **Mentionable**, which also lets every member ping it, or
- give the **HareWare** role **Mention @everyone, @here, and All Roles**, which
  lets the bot ping a role nobody else can.

Use the second. It keeps `@Editorial Board` unpingable by hand, which is what a
duty role should be.

That permission is broad, so the narrowing happens in the message rather than in
Discord: `inert()` in `src/lib/services/discord/post-message.ts` strips mention
markup out of every headline and Notion field before it goes near a message, so
the only mention that survives is the one we wrote. `allowed_mentions` is set
too, but it is not the control — it does not gate a mention inside a Components
V2 text display, which is the whole reason `inert()` exists.

This is also why there are no webhooks. A webhook would make the message author
a dead end — webhooks are not users, so clicking the name shows no profile —
need its own avatar rather than the one set in the developer portal, and turn
every channel into a URL that is a credential to create, store and rotate.

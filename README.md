# HareWare

The in-house tooling for [The Hare](https://theumdhare.com):

- **Public tools** that turn published articles into Instagram posts, InDesign
  copy and newsletter content. Open to anyone, no account needed.
- **A Discord bot** that posts the club's recurring reminders.
- **`/article`**, a Discord command that lets the Editorial Board edit Articles
  without opening Notion.
- **Membership pages** — an attendance kiosk, a roster reconciler, and a
  standing page that works out who may vote. For the Editorial Board.

HareWare is not the article tracker. The tracker lives in Notion, maintained by
hand, and nothing HareWare does depends on its workflow state being current.
[ADR 0006](docs/adr/0006-hareware-is-a-reminder-bot.md) explains why; read it
before proposing that HareWare should track articles.

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
npx wrangler versions upload   # uploads a version, prints a preview url
```

## Worker types

`worker-configuration.d.ts` is 590KB of runtime declarations generated from
`wrangler.jsonc`. It is gitignored and written by the `postinstall` hook, so
`npm ci` is all a clone needs.

Run `npm run types` after changing a binding, or whenever the type checker
claims `D1Database` and `cloudflare:workers` do not exist.

**It reads `.dev.vars` too**, adding whatever it finds there to `Env`, so a
secret you have locally can type check here and nowhere else. Every variable the
code reads belongs in `HareWareEnv` in `src/env.d.ts`.

## Deployment

Pushes deploy through Cloudflare Workers Builds. `npm run deploy` publishes from
a terminal when you need it.

## Automations

A Cloudflare Cron Trigger runs `scheduled()` in `src/worker.ts` every hour.
Cloudflare crons are UTC with no timezone setting, so each automation decides
whether a given tick is its hour — see `src/lib/eastern.ts`.

- **Social duty** (8am Eastern) — if anything published on theumdhare.com today,
  posts it to `#instagram-posting` and pings that day's poster role.
- **Board meeting** (8am Eastern) — if the Meetings database holds an Editorial
  Board meeting dated today, posts a link to its agenda in `#editorial-board`.
- **Member applications** (every hour) — creates a `Members` row for each
  approved Discord application that matches nobody on the roster, and posts
  nothing. Hourly so that somebody who applies in the afternoon can find
  themselves on the kiosk at that evening's meeting.

The reminders post nothing on a day with nothing to say. Every tick also
re-registers `/article` from Notion's schema; see
[Editor commands](#editor-commands).

Automations are listed in `src/lib/automations/registry.ts`, which is also what
dispatches them.

### Environment

Every value below is optional, and nothing throws when one is missing: an
automation whose secret is absent records a line naming it and does nothing.

Set them with `npx wrangler versions secret put <NAME>`. Plain
`wrangler secret put` refuses unless the latest version happens to be the
deployed one, which it usually is not.

| Secret                     | What it is                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `DISCORD_BOT_TOKEN`        | Sends every reminder, reads the roles the admin tools gate on, and reads the members and applications |
| `NOTION_TOKEN`             | Notion integration token. Reads Meetings, Members and Articles, and writes all three                  |
| `SESSION_SECRET`           | Signs the session and OAuth-state cookies. `openssl rand -hex 32`                                     |
| `DISCORD_CLIENT_SECRET`    | The OAuth client secret, exchanged once per sign-in                                                   |
| `REMINDERS_TRIGGER_SECRET` | Guards `POST /api/automations/run`. Unset, that route answers `404`                                   |

`DISCORD_BOT_TOKEN` is the one nothing works without: the reminders post as the
bot, and the admin tools ask Discord for the caller's roles on every request.

#### Switches, for `.dev.vars` only

These exist to exercise the reminders. None belongs in a deployed secret.

| Switch                   | What it does                                                                      |
| ------------------------ | --------------------------------------------------------------------------------- |
| `REMINDERS_DRY_RUN`      | Log the Discord payload instead of sending it                                     |
| `REMINDERS_NO_PING`      | Post as normal but notify nobody — writes the role's name in place of the mention |
| `REMINDERS_IGNORE_HOUR`  | Run both reminders on every tick, not just at 8am                                 |
| `REMINDERS_TEST_CHANNEL` | Send both reminders here instead of the club's real channels                      |

`REMINDERS_IGNORE_HOUR` does the most damage if it reaches production: the
Worker would post both reminders every hour until somebody removed it. To fire a
reminder in production, use the manual trigger below.

#### Firing a reminder by hand

`POST /api/automations/run` runs the automations immediately, through the same
path the cron takes. The Editorial Board can do the same from `/automations`.

```sh
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $REMINDERS_TRIGGER_SECRET" \
  "https://hareware.zsrobinson.com/api/automations/run"
```

The content type is required: Astro rejects a cross-site `POST` that looks like
a form submission, including one with no content type, with
`403 Cross-site POST form submissions are forbidden`.

| Parameter                                             | What it does                                        |
| ----------------------------------------------------- | --------------------------------------------------- |
| `?only=meeting`, `?only=social`, `?only=applications` | Fire one rather than all                            |
| `?dry=1`                                              | Report what each would post, without posting it     |
| `?silent=1`                                           | Post, but notify nobody                             |
| `?sync=1`                                             | Re-register the commands from Notion; fires nothing |

The response is a line per automation saying what it did. The secret travels in
a header because Cloudflare logs URLs.

**Use `?dry=1` the first time.** Production carries neither `REMINDERS_DRY_RUN`
nor `REMINDERS_NO_PING`, so an unqualified trigger posts to `#instagram-posting`
and `#editorial-board` for real and pings the roles. The parameters apply to one
request and leave nothing behind.

#### When a run fails

A failed **cron** run posts to `#carl-bot` naming the automation and the reason
— not `#editorial-board`, so that operational noise does not sit beside the
reminders themselves.

It reports a failure only when the previous recorded run of that automation
succeeded, so something broken for a week says so once. It speaks up again after
a run that worked. With no history to compare against, it reports.

A run fired **by hand** reports nothing, because the response already carries
the error. The alert never pings a role and never throws, so a reminder that
posted correctly is not recorded as failed because the alert could not be sent.

#### Not variables

Channel and role ids, the guild id, the Notion data source ids, the reminder
hour, HareWare's own origin, and the Discord application id and public key are
constants in:

- `src/lib/automations/config.ts` — channels, duty roles, reminder hour, origin
- `src/lib/services/discord/config.ts` — guild, application, `@Editorial Board`
- `src/lib/members/config.ts` — the Members and Meetings data sources
- `src/lib/articles/config.ts` — the Articles data source

None of them is secret, and they change about once a year, so a one-line pull
request is a cheaper way to change them than a store nobody remembers, and it
leaves a reviewable history. Moving a reminder to another channel is one of
these; the bot needs **View Channel** and **Send Messages** there.

`npm test` needs none of the above and touches no network.
`npm run reminders:send` posts real messages using `.dev.vars`, and the shell
overrides the file, so `REMINDERS_DRY_RUN= npm run reminders:send` sends for
real.

### Setup outside the repo

1. **Discord roles.** Create `@Social Sunday` through `@Social Saturday` and
   assign them. Copy each role's ID (Settings → Advanced → Developer Mode, then
   right-click the role → Copy ID) into `SOCIAL_ROLE_IDS`.
2. **Discord bot.** Invite the application and give its role:
   - **View Channel** and **Send Messages** in `#instagram-posting`,
     `#editorial-board` and `#carl-bot`;
   - **Mention @everyone, @here, and All Roles** — without it the reminders post
     and ping nobody, silently. See
     [Making the bot able to ping](#making-the-bot-able-to-ping);
   - **Kick Members**, to read member applications. See
     [Discord setup](#discord-setup).

   In the developer portal, enable the **Server Members** privileged intent.

3. **Notion.** Create an internal integration at
   [notion.so/my-integrations](https://www.notion.com/my-integrations) and set
   its token as `NOTION_TOKEN`. Then, in each of **Meetings**, **Members** and
   **Articles**, add the integration under `⋯` → Connections. Connections are
   opt-in per database, so the token reads nothing until you do. The IDs are
   already in the code; see [Not variables](#not-variables).
4. **HareWare's own origin.** `HAREWARE_ORIGIN` in
   `src/lib/automations/config.ts` is wherever the app is deployed. A cron tick
   has no request to read an origin from. Without it the social reminder still
   goes out, without its "open in HareWare" buttons.
5. **WordPress.** Nothing. The social reminder reads the public feed.

## Membership and standing

The constitution makes a member eligible to vote if, within the past year, they
attended 3 general body meetings, made 2 contributions, or worked 1 volunteer
event. HareWare computes that from records every time it is asked and stores no
"eligible" flag. [ADR 0010](docs/adr/0010-standing-is-computed.md) has the
design.

- **`/attendance`** is the kiosk: a laptop at the front of the room where people
  type their own names, recording attendance on the meeting in Notion. It
  creates a Members row for anybody the roster has never seen.
- **`/reconciler`** lists everything about the roster that needs a person to
  decide. Run it before an election: a duplicate splits somebody's attendance
  across two rows and can cost them a vote.
- **`/standing`** computes eligibility over any window and thresholds, with the
  constitution's rule as a preset, and exports CSV for TerpLink.

### Notion setup

`Meetings` needs:

| Property    | Type                                                         |
| ----------- | ------------------------------------------------------------ |
| `Type`      | Select: `General Body`, `Editorial Board`, `Volunteer Event` |
| `Attendees` | Relation to `Members`, two-way with its `Attendance`         |

Set `Type` on existing rows. Only `General Body` and `Volunteer Event` count
toward standing, and a meeting with no type counts toward nothing.

`Members` needs:

| Property        | Type                                                                       |
| --------------- | -------------------------------------------------------------------------- |
| `Email`         | Email                                                                      |
| `Discord ID`    | Text                                                                       |
| `Status`        | Select. Options are Notion's to name, except `Alum`, which voting excludes |
| `Attendance`    | The other side of Meetings' `Attendees`                                    |
| `Contributions` | Formula: `prop("Articles Count") + prop("Images Count")`                   |

Renaming a `Status` option needs no deploy, because the pickers read the live
schema. Removing `Alum` does need one, and the reconciler warns if it goes
missing, because without it nobody is excluded as an alum.

Standing also reads each Article's `Publication Date`, which is why Articles
must be connected too.

### Discord setup

The bot reads the applications people fill in to join the server, which carry
the cleanest name and email the club has. Membership screening with manual
approval has to stay switched on.

Reading them needs **Kick Members** — "Kick, approve, and reject members" in the
role editor — which is the permission Discord gates
[member applications](https://support.discord.com/hc/en-us/articles/29729107418519-Server-Member-Applications)
behind. Without it Discord answers `200 {}` rather than refusing; the sync
treats that as an error naming the permission, which surfaces on the reconciler
and in the `#carl-bot` alert.

The **Server Members** intent lets the reconciler and kiosk read the server's
member list, to suggest which account belongs to an unlinked row.

The form's questions are found by looking for `name`, `email` and `year` in the
question's text, so they can be reworded freely as long as the keyword stays. If
one is reworded past it, every application arrives without that answer, and the
reconciler lists them under **Discord applicants needing attention** to be added
by hand.

### The Google Group

Software cannot read or write the announcements group: the Admin SDK needs
Workspace administrator credentials on the domain that owns it, and the club's
group belongs to a consumer Gmail account.

Instead, open the group's members, use **Export CSV**, and give the file to the
reconciler. It reads the file in the browser without uploading it, and lists who
on the roster is missing, who has no address, and which group addresses match
nobody. Paste the missing ones into the group's bulk-add field.

Nothing is remembered between runs, so somebody who left the group on purpose
will be offered again. Addresses outside `terpmail.umd.edu` and `umd.edu` are
flagged, because Google needs an invitation for those.

## Editor commands

`/article` lets the Editorial Board change an Article without opening Notion.
[ADR 0009](docs/adr/0009-editor-commands-in-discord.md) explains the design.

The choices for Article Status, Section and Image Status come from Notion's
schema, so adding or removing a status is done in Notion and nothing here
changes. Discord bakes choices into the command registration, so the command is
re-registered every hour.

The Article picker reads Notion directly — the hundred most recently edited
Articles in one request — and matches them here, because Notion cannot do a
fuzzy search. The Worker holds that read for ten seconds so a burst of
keystrokes costs one request.

### Setting it up

**Grant the role.** Commands register with `default_member_permissions: "0"`,
which hides them from everybody. In **Server Settings → Integrations → HareWare
→ Commands**, add an override granting `/article` to `@Editorial Board`. The
override survives re-registration. It is not the security boundary: anyone who
reaches the command without the role is refused at runtime.

**Keep Members shared with the integration.** If it is not, Notion drops the
Author and Image Crew relations from the schema and they read as empty. The
commands refuse to write in that state rather than overwrite credits they cannot
see.

## Making the bot able to ping

A role mention can render perfectly and reach nobody — the trap is described in
[docs/agents/silent-failures.md](docs/agents/silent-failures.md). A role becomes
pingable in one of two ways:

- mark the role **Mentionable**, which also lets every member ping it, or
- give the **HareWare** role **Mention @everyone, @here, and All Roles**, which
  lets the bot ping a role nobody else can.

Use the second, so `@Editorial Board` stays unpingable by hand.

That permission is broad, so the narrowing happens in the message. `inert()` in
`src/lib/services/discord/post-message.ts` strips mention markup from every
headline and Notion field before it goes into a message, so the only mention
that survives is the one we wrote. `allowed_mentions` is set too, but does not
gate a mention inside a Components V2 text display.

The bot posts as itself rather than through channel webhooks. A webhook author
has no profile to click, needs its own avatar, and turns every channel into a
URL that is a credential to create, store and rotate.

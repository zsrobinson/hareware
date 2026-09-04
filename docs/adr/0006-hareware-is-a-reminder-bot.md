# 6. HareWare is a reminder bot, not an article tracker

**Status:** Accepted — 2026-09-03

Supersedes ADR 0002 and ADR 0003. Amends ADR 0001 and ADR 0004.

## Context

The HareWare v2 milestone described a Cloudflare Workers app over Notion and
WordPress: Discord sign-in, an inline-editable Article board, WordPress draft
creation from Notion, a publish-date mirror, and a daily Instagram duty
reminder. Thirty-one issues and five ADRs.

None of it was built beyond the platform move to Cloudflare and a Discord OAuth
implementation that is parked, unmerged, on `issue-19-discord-oauth`.

Three findings retired it, in ascending order of how much they mattered.

### Notion's automations cannot express the workflow

Checked against the product rather than the documentation, which is silent or
wrong on all three:

- A recurring (`Every day`) trigger sends **no page data at all**. The webhook
  action offers a URL and headers and nothing else, because no page is in
  context.
- Date properties trigger only **on edit**. There is no "when this date
  arrives" trigger, and no way to filter a recurring run down to pages matching
  today. (Notion does offer date-property _notification_ reminders — "1 day
  before" — but those send an in-Notion notification and cannot call a webhook.)
- Database automations cannot be triggered by other automations, and whether an
  API write fires one is undocumented.

Together these mean Notion can serve as a **timer** and nothing else. Every
design that put editorial rules into Notion automations died on one of the
three.

### Rules cannot live in two places

Had the rules lived in Notion automations, setting a Status in Notion would run
them and setting the same Status through the API would not — so the same
editorial action would do different things depending on where the editor
clicked. Avoiding that means HareWare owns every rule, which means Notion
automations are reduced to triggers, which returns us to the limits above.

### The tracker's founding purpose is better served without it

The Article tracker exists because, once "every article goes to Instagram"
became the rule, the social media team could not see what needed posting. It
began as a Google Sheet built for exactly that, and everything else accreted
onto it.

A bot that pings the social team on publish day serves that original purpose
directly, and reads it from WordPress, which is ground truth about what
published. No human has to maintain anything for it to be correct.

What remains for the tracker is planning: the in-flight overview, catching
Articles approved but never written, the pitch backlog, and the mapping from a
Byline to the Member behind it. All of it is consulted weekly at most.

That distinction is the load-bearing one:

> **A coordination tool has to be accurate or it is dangerous — someone acts on
> it and gets it wrong. A planning tool can be 80% accurate and still be worth
> having.**

The tracker began as the first and became the second, while still being
maintained as though it were the first. Integrating HareWare with it would make
it a coordination tool again — load-bearing, and demanding _more_ editorial
discipline rather than less.

## Decision

**HareWare does not integrate with the Article tracker.**

HareWare is the existing public tools — the post generator, magazine, email and
word-count pages — plus a scheduled reminder bot that posts to Discord:

- **8am Eastern, daily.** Read today's Articles from the public WordPress feed.
  If anything published, ping that day's `@Social <Day>` role in
  `#instagram-posting`.
- **Same schedule.** Query the Notion Meetings database for a meeting dated
  today. If there is one, post a link to its agenda page in the board channel.

Both run from a Cloudflare Cron Trigger, which requires a worker entrypoint of
our own that exports `fetch` and `scheduled` together over
`@astrojs/cloudflare/handler`.

There are no inbound webhooks, no Notion automations, no Discord application, no
sign-in, and no database of our own. Messages are posted through Discord channel
webhook URLs, with `allowed_mentions` pinned to the intended role.

The Article tracker stays in Notion, maintained by hand, read by people rather
than by software.

## Consequences

**The tracker is free to be sloppy.** Nothing anyone acts on depends on it being
current, so it can decay over a busy semester without breaking a feature. That
is the point, not a regression.

**Notion is nearly untouched by software.** One integration token reads the
Meetings database. The Articles database is not read or written by anything.

**The _Posted to Instagram_ property was removed.** It existed so the board could
show what social had left to do. The daily reminder answers that question
directly and from WordPress, so the column was tracking something nobody had to
look up any more. Marking a post done moves to the reminder message itself.

**Notion's paid features are no longer load-bearing.** Automations are the part
of Notion that costs a plan; the API is free on every tier, including Free. The
club's student-organisation grant lapsing would therefore cost HareWare nothing.

**ADR 0002 is superseded.** The Durable Object existed to batch writes from an
inline-editable board against Notion's three-requests-per-second budget. There
is no board and there are no writes, so there is nothing to serialise.

**ADR 0003 is superseded.** Its premise was that v2 made this app-shaped work.
It did not happen, so "should we leave Astro" is now trivially answered no. Its
recommendations of `nuqs` and TanStack Table were never installed and are not
needed.

**ADR 0001 is reaffirmed, with a second reconsideration trigger.** See below.

**ADR 0004 is implemented and amended.** The Byline/Member split was built in
Notion, and — contrary to what that ADR said — historical rows were backfilled
by hand. Its "Historical rows are not backported" section is amended to record
what was actually done.

**Discord OAuth is parked, not deleted**, on `issue-19-discord-oauth`. Nothing
of it is on `main`. It is the natural starting point if a signed-in surface ever
returns.

**Revisit this when the club wants something a ping cannot do** — most likely a
log of what the bot did, or Discord slash commands for editorial approvals. Both
were designed and deferred; both need the parked OAuth work or a Discord
application. Until then, the reminder bot is the whole product.

**If someone proposes building an article tracker, read this file first.** The
idea recurs, and the reasoning above is not obvious from the outside.

## Alternatives considered

### Rolling our own tracker — D1, or any database we control

Rejected, and not for technical reasons: D1 is free, adequate, and already
available on this account. It fails on maintenance. The club's binding
constraint is that every maintainer graduates. Notion needs no maintainer; a
tracker we build needs one permanently, and the version of the club that
inherits it will not have one.

The club database that failed years ago is often remembered as having failed
because it stored article content. It failed because the person who understood
it left. Holding only metadata, with WordPress owning the archive, bounds the
damage — it does not change the maintenance arithmetic.

### Google Sheets as the store

Not rejected. **Recorded as the designated successor** if Notion ever stops
being free for us. It is free through the university's Workspace, it passes ADR
0001's test that a club member can open and edit it unaided, and Apps Script
supplies free scheduled triggers that can call a webhook. Its weaknesses are a
weaker data model: no relations, and no stable row identity without adding a
UUID column.

### An editorial workflow plugin on WordPress — PublishPress, Edit Flow

Noted, not adopted. PublishPress's free tier offers custom post statuses, an
editorial calendar, editorial comments, editorial metadata and notifications,
which is close to what the tracker does, and it is the nearest thing to standard
newsroom software available at this scale. Rejected for the reason ADR 0001
gives against storing metadata in WordPress: it makes a plugin load-bearing for
reading your own data. Worth reconsidering only if the tracker leaves Notion.

### Event-driven webhooks from Notion into HareWare

Rejected on the three product limits in Context. It was the preferred design for
most of the discussion — it is genuinely more responsive, and it reacts to
transitions rather than re-deriving state — and it lost to the fact that Notion
cannot fire on the events we needed.

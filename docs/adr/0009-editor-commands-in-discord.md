# 9. Editors change Notion from Discord

**Status:** Accepted — 2026-09-04

Amends [ADR 0006](0006-hareware-is-a-reminder-bot.md). Amends
[ADR 0004](0004-byline-as-text-member-as-relation.md).

## Context

Editors keep a Discord tab open all day and a Notion tab open only when they
have to change something. The changes themselves are small — move an Article to
_Section Edited_, set a Publication Date, credit whoever wrote it — and the cost
is almost entirely the context switch rather than the edit.

ADR 0006 answered a different question. It rejected **integrating with the
Article tracker**, on the grounds that doing so would make a hand-maintained
planning tool load-bearing for coordination, and would demand more editorial
discipline rather than less. That reasoning stands and is not disturbed here.

This is not that. Nothing new depends on the tracker being current, no software
reads it to decide anything, and no reminder is derived from it. The commands
are a second way to perform an edit somebody was going to perform in Notion
anyway. If every command stopped working tomorrow, the club opens Notion.

### Notion's integration webhooks are not Notion's automations

**Amended 2026-09-05: HareWare no longer receives webhooks.** They were built,
delivered correctly, and were still not enough — see "The picker reads Notion"
below. This section stays because the distinction it draws is real and somebody
will reach for webhooks again, and the constraints listed here are what they
should weigh before doing so.

ADR 0006 rejected "event-driven webhooks from Notion" and it is easy to read
that as covering this. It does not. That rejection was about **database
automations** — the no-code triggers configured on a database — and it was
correct about them: a recurring trigger sends no page data, date properties fire
only on edit, and automations cannot chain.

**Integration webhooks are a different mechanism**, configured on the
integration rather than the database, and they carry none of those limits. They
fire on `page.created`, `page.properties_updated`, `page.deleted` and
`data_source.schema_updated`, among others.

They have their own constraints, which the design below is shaped around rather
than assumed away:

- **At-most-once delivery**, with up to 8 retries over roughly 24 hours. Events
  can be lost.
- **Unordered.** Events may arrive in a different order than they occurred.
- **Delayed** — usually under a minute, up to five.
- **Thin payloads.** The event names the page and which property ids changed,
  never the new values, so the page must be fetched regardless.

## Decision

**Editors may perform routine Article edits through Discord slash commands.**

One command, `/article`, with a subcommand per property. Replies are ephemeral:
the editor sees the result, the channel sees nothing. Access is the
`@Editorial Board` role — the same constant the admin panel gates on, so
"editor" has one definition.

### Notion is the source of truth for the interface, not just the data

The choices offered for Article Status, Image Status and Section are read from
the Notion schema, and subcommand names mirror the Notion property names with
the word "Article" dropped. Adding a status, removing one, or renaming a section
changes what Discord offers **without a code change**, because nothing about
those values is written down here.

Discord bakes an option's choices into the command registration rather than
resolving them at use, so reflecting a schema change means re-registering. That
happens on the hourly cron, unconditionally. Discord allows two hundred guild
registrations a day and twenty-four spends fourteen per cent of that, so there
is nothing worth saving by remembering what was last sent — and a remembered
hash can disagree with what is actually up there.

### The picker reads Notion, and holds it for ten seconds

**Amended 2026-09-05. The D1 index this section described has been deleted.**

Picking an Article by name needs a search on every keystroke, and Notion cannot
express a fuzzy one — so the candidates have to be here, in memory, to be
matched. The question was only ever where they come from.

An index in D1 was the first answer, kept current by three writers: a webhook, a
write-through from each command, and an hourly rebuild. It cost a version guard
to reconcile them, and that guard discarded a second edit made in the same minute
as the first, because `last_edited_time` has minute resolution. An editor
renaming a Headline watched Discord hold the old one. The deeper problem is that
a cache fed by webhooks is never "immediately": Notion documents delivery as most
within a minute and up to five, and measured here it was nine seconds once and
sixty-five the next.

So Notion is read directly. The numbers this rests on, all measured:

|                                 |                                            |
| ------------------------------- | ------------------------------------------ |
| 100 most recent, sorted         | 1 request, ~0.7s (one 2.0s outlier)        |
| the whole corpus                | 2 requests, ~1.2s — and growing every year |
| a `contains` search             | 1 request, ~0.5s                           |
| Discord's autocomplete deadline | 3.0s, hard, cannot be deferred             |
| Notion's budget                 | ~3 requests a second                       |

The hundred most recently edited is one request, and sorted by recency it is
what anybody is plausibly reaching for. Matching happens locally, so a dropped
letter or the wrong word order still finds it. When nothing matches — the
Article is older than the hundred — Notion is asked for a substring match, which
is coarser and deliberately a last resort.

Reading the **whole** corpus and matching all of it was considered and rejected:
139 rows is two requests today and an unbounded number in five years, and the
club expects this to outlive everyone currently in it.

#### The snapshot, and what it assumes

A module-scope variable holds the last read for ten seconds. It exists for
Notion's rate limit and not for speed: without it, six keystrokes are six
requests at roughly three a second, and two editors typing at once would be
refused. The assumptions, stated so they can be checked later:

- **Isolates stay warm across a few seconds of typing.** Cloudflare keeps one
  alive between requests, so the keystrokes of one editor almost always share it.
  If that is ever false the cost is one extra 0.7s read — latency, never a wrong
  answer. The snapshot can be absent; it cannot be incorrect.
- **The snapshot is shared between everyone an isolate serves.** Safe here: the
  Article list is not per-person, and the `@Editorial Board` check runs before
  anything reads it.
- **Several isolates hold independent copies**, each at most ten seconds old.
- **Ten seconds is a burst of typing and little else.** The next time somebody
  opens the picker they get Notion, not this.
- **The Cache API is the upgrade** if isolate churn ever shows up in the logs:
  per-colo, free, shared across isolates — and unavailable on `workers.dev`
  subdomains, which is worth knowing before reaching for it.

#### What is left in D1

The invocation log, and nothing else. `choice_options` and `sync_meta` went with
the index: the schema is read and the command surface registered in the same
invocation, so the options never needed to outlive it, and re-registering hourly
costs twenty-four of Discord's two hundred daily registrations — cheaper than a
stored hash that could disagree with what is actually up there.

### Members is keyed by Discord user, and fills itself in

An Article's writer is chosen with Discord's native user picker rather than by
searching Notion. The user always exists, the picker is always current, and the
interaction payload resolves their name with no extra request.

The picker is required when creating an Article or changing a credit. HareWare
always writes the Discord-backed Members relation with the printed Byline; an
optional Byline argument is specifically a pseudonym for that selected member.
Legacy rows without a relation can still be repaired directly in Notion, but a
Discord command never creates another one.

At the time of writing, **9 of 48 Members carry a Discord ID**. Creating a row
whenever the id does not match would have produced a duplicate for each of the
other 39. So a miss falls back to matching the Member's Name, normalised, and
**writes the Discord ID onto the row it finds** — the roster backfills itself as
editors credit people, which is the only backfill that costs nobody an
afternoon. An ambiguous or absent match asks the editor rather than guessing,
and every outcome is stated in the reply, because a row that appears silently is
how a database acquires nine of them.

## Consequences

**The tracker stays a planning tool.** Nothing added here reads it to make a
decision. ADR 0006's distinction — a coordination tool must be accurate or it is
dangerous; a planning tool may be 80% accurate and still worth having — is
unchanged, because the commands are an input to the tracker and never an output.

**Notion's language is the product's language.** Mirroring the property names
means the club renames a thing once. It also means no value is ever typed into
this repo, so the casing traps — `Not started`, not `Not Started` — cannot be
introduced.

**D1 holds only the invocation log.** An index lived there briefly; ADR 0007's
rule that nothing in D1 is authoritative is now true by construction rather than
by discipline, because there is nothing in it to be authoritative about except
the record of what HareWare did.

**There is no webhook to die.** Nothing is pushed to us and nothing is kept in
step, so the class of failure where a feed quietly stops — which this document
originally spent a section defending against — cannot happen.

**Relations can be written safely only while Members is shared with the
integration.** Notion omits a relation property from the schema entirely when
its target is inaccessible, and the values then read as empty rather than
missing. An append built on that read would delete co-authors nobody could see.
The code distinguishes absent from empty and refuses rather than writes.

**Every mutation is an Invocation.** Commands write to the same log as the
automations, so `/admin/log` answers who set an Article to Published and when.

## Alternatives considered

### Live Notion queries for autocomplete, with no index

Rejected here, and **adopted 2026-09-05** — the reasoning below was right about
the constraint and wrong about the shape.

The rejection assumed autocomplete would read the whole table, which is two
requests per keystroke against a budget of about three a second. The hundred
most recently edited, sorted by Notion, is **one** request and ~0.7s; a
ten-second snapshot in the isolate makes a burst of typing one request rather
than six. The budget the rejection was protecting is intact, and the index it
justified is gone.

What the rejection got right and is still worth keeping: the failure mode is an
empty dropdown with no explanation, so every path through autocomplete logs why
it answered with nothing.

### Autocomplete for Status, Section and Image Status

Rejected. It would reflect the schema without re-registration, but replaces a
native picker — instant, no typing, no request — with a text field. Re-registering
on `data_source.schema_updated` keeps both properties.

### A card of buttons instead of subcommands

Rejected for having two implementations of every action. Buttons make illegal
states unpresentable, which mattered when Status was to be gated; it is not.
`/article show` is read-only, and commands are the one way to change something.

### Creating a Member row whenever the Discord ID does not match

Rejected as written. **Amended 2026-09-05:** an absent match now creates the row.

The rejection was about _guessing_, and that part stands. Matching on name and
backfilling the id still happens first, and it is still what keeps 39 duplicates
of people who already have article histories from appearing.

What changed is the case where nothing matches at all. Refusing there means an
editor cannot credit a new writer without leaving Discord, which is the one
thing these commands exist to avoid — and the row they would go and make by hand
is the row HareWare would have made.

The reasoning survives in why the other outcomes still refuse: `ambiguous` and
`conflicted` are guesses and stay refused, and `linkable` writes the id onto the
row it found rather than making a second one. Every outcome is stated in the
reply — "created Sam Rivera in Members" — which is what the original objection
was really protecting. Not that a row exists, but that one appears without
anybody noticing.

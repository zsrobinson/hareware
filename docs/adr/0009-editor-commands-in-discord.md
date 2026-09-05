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
happens on the `data_source.schema_updated` webhook, and again on the hourly
cron regardless — the webhook for speed, the cron for truth. A hash of the
computed registration is stored so an unchanged schema re-registers nothing.

### An index in D1, serving autocomplete and nothing else

**Amended 2026-09-05: the picker reads Notion directly, and the index is what
catches it when that read is slow.**

The index was built on the assumption that autocomplete could not ask Notion on
every keystroke. That is still true of a whole-table read — 139 rows is two
requests and about 1.2 seconds — but a **recency-sorted hundred is one request
and about 0.7 seconds**, against Discord's hard three. One request per keystroke
sits at Notion's budget of roughly three a second rather than double it.

What forced the change is that a cache fed by webhooks is never "immediately".
Notion's delivery is documented as "most within a minute, up to five", and
measured here it was nine seconds once and sixty-five the next. An editor who
renames a Headline and opens the picker is not waiting on our sync; they are
waiting on Notion's delivery, and that is not a number anybody can plan around.

So the picker asks Notion first, with a 1.4 second deadline, and falls back to
the index. Live when Notion is quick, a rebuild-cadence stale when it is not,
and never an empty dropdown — which is what the index was really for.

The rebuild stays **hourly**. It briefly ran every minute, which is 400,000 row
writes a day against D1's free hundred thousand: the index would have gone quiet
part-way through every afternoon, silently, which is the failure this whole
document exists to avoid. It corrects drift; it is not what anybody waits on.

### Members is keyed by Discord user, and fills itself in

An Article's writer is chosen with Discord's native user picker rather than by
searching Notion. The user always exists, the picker is always current, and the
interaction payload resolves their name with no extra request.

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

**D1 holds a cache for the first time.** ADR 0007 established that nothing in D1
is authoritative, and that holds: `article_index` is a description of Notion,
rebuilt hourly from it, and nothing reads it to decide what to write.

**A dead webhook is detectable.** The hourly rebuild diffs what it replaces, and
an unexplained diff means delivery stopped. That is reported the way a failed
automation is, because a webhook that quietly stops is the same shape of failure
as a reminder that quietly did not run.

**Relations can be written safely only while Members is shared with the
integration.** Notion omits a relation property from the schema entirely when
its target is inaccessible, and the values then read as empty rather than
missing. An append built on that read would delete co-authors nobody could see.
The code distinguishes absent from empty and refuses rather than writes.

**Every mutation is an Invocation.** Commands write to the same log as the
automations, so `/admin/log` answers who set an Article to Published and when.

## Alternatives considered

### Live Notion queries for autocomplete, with no index

Rejected on rate limit rather than latency — a single query measured comfortably
inside the deadline, but autocomplete fires per keystroke against a
three-per-second budget, and the failure mode is an empty dropdown with no
explanation.

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

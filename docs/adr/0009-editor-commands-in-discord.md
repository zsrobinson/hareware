# 9. Editors change Notion from Discord

**Status:** Accepted — 2026-09-04

Amends [ADR 0006](0006-hareware-is-a-reminder-bot.md) and
[ADR 0004](0004-byline-as-text-member-as-relation.md).

## Context

Editors keep Discord open all day and open Notion only when they have to change
something. The changes are small — move an Article to _Section Edited_, set a
Publication Date, credit whoever wrote it — and most of the cost is the context
switch rather than the edit.

ADR 0006 rejected integrating with the Article tracker because that would make a
hand-maintained planning tool load-bearing for coordination. This does not do
that. Nothing new reads the tracker to decide anything; the commands are a
second way to make an edit somebody would otherwise make in Notion. If they
stopped working, the club would open Notion.

## Decision

Editors can make routine Article edits through Discord slash commands.

One command, `/article`, with a subcommand per property. Replies are ephemeral.
Access is the `@Editorial Board` role, the same constant the admin tools gate
on, so "editor" has one definition. Discord allows three seconds to answer, so a
write defers and follows up with its result; autocomplete cannot defer, so its
read races that deadline.

### Notion defines the interface as well as the data

The choices for Article Status, Image Status and Section are read from the
Notion schema, and subcommand names mirror Notion's property names. Adding,
removing or renaming an option in Notion changes what Discord offers with no
code change, because no option name is written down in this repository.

Discord bakes choices into the command registration, so a schema change needs a
re-registration. That happens on the hourly cron, unconditionally: Discord
allows 200 guild registrations a day and this uses 24, so there is nothing worth
saving by remembering what was last sent, and a remembered hash could disagree
with what Discord actually holds.

### The Article picker reads Notion directly

Picking an Article by name needs a fuzzy search on every keystroke, which Notion
cannot express, so candidates are matched here in memory. They come from one
request: the 100 most recently edited Articles, which is what an editor is
almost always reaching for. When nothing matches, Notion is asked for a
substring match as a coarser fallback.

Measured when this was designed:

|                                 |                                     |
| ------------------------------- | ----------------------------------- |
| 100 most recent, sorted         | 1 request, ~0.7s (one 2.0s outlier) |
| the whole corpus                | 2 requests, ~1.2s, and growing      |
| a `contains` search             | 1 request, ~0.5s                    |
| Discord's autocomplete deadline | 3.0s, hard                          |
| Notion's rate limit             | ~3 requests a second                |

Reading the whole corpus was rejected because it grows every year. A
module-scope snapshot holds the last read for ten seconds, so a burst of typing
costs one request instead of six. It is there for the rate limit, not for speed,
and rests on these assumptions:

- One editor's keystrokes almost always reach the same warm isolate. When they
  do not, the cost is one extra read — latency, never a wrong answer.
- The snapshot is shared by everyone an isolate serves. That is safe because the
  list is not per-person and the role check runs first.
- Ten seconds covers a burst of typing and nothing more; the next time somebody
  opens the picker, they get Notion.
- If isolate churn ever shows in the logs, the Cache API is the upgrade. It is
  unavailable on `workers.dev` subdomains.

### Writers are picked as Discord users

An Article's writer is chosen with Discord's native user picker. The user always
exists, the picker is always current, and the interaction payload carries their
name. The picker is required when creating an Article or changing a credit, and
HareWare always writes the Members relation alongside the printed Byline; the
optional Byline argument is a pseudonym for the selected member.

Most Members rows had no Discord ID when this was built, so the lookup falls
back to the normalised name and writes the Discord ID onto the row it finds. The
roster fills itself in as editors credit people. When nothing matches, a new
Members row is created. An ambiguous match, or two rows sharing one ID, is
refused and the editor is asked, and every outcome — including "created Sam
Rivera in Members" — is stated in the reply so no row appears unnoticed.
[ADR 0010](0010-standing-is-computed.md) later added rows created without any
Discord ID, from the attendance kiosk.

A new Article starts at _Approved_ and requires its Section: it is created after
a section editor has approved the idea, so both are already known.

## Consequences

**The tracker stays a planning tool.** The commands are an input to it, never an
output.

**Notion's language is the product's language.** The club renames a thing once,
in Notion. Because no option value is typed into this repository, casing traps
such as `Not started` versus `Not Started` cannot be introduced.

**D1 holds only the invocation log.** Nothing about Articles is cached there, so
ADR 0007's rule that D1 is never authoritative holds by construction.

**Every mutation is an Invocation**, recorded with its before and after values,
so `/log` answers who set an Article to Published and when, and what to set it
back to.

**Relations can be written safely only while Members is shared with the
integration.** Notion omits a relation from the schema when its target is not
shared, and the value then reads as empty rather than missing. The code tells
the two apart and refuses to write.

## Alternatives considered

**An index of Articles in D1, fed by Notion's integration webhooks.** Built on
2026-09-04 and removed the next day. It had three writers — webhooks, a
write-through from each command, and an hourly rebuild — and the version guard
reconciling them discarded a second edit made in the same minute, because
`last_edited_time` has minute resolution. Webhook delivery also took anywhere
from nine seconds to over a minute. Anyone reaching for webhooks again should
know they are at-most-once, unordered, delayed by up to five minutes, and carry
only which properties changed, never their values. (These are Notion's
integration webhooks, a different mechanism from the database automations ADR
0006 rejected.)

**Autocomplete for Status, Section and Image Status.** It would reflect the
schema without re-registering, but replaces an instant native picker with a text
field.

**A card of buttons instead of subcommands.** Two implementations of every
action. `/article show` is read-only, and commands are the one way to change
something.

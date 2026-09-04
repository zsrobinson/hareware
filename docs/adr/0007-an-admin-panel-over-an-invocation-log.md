# 7. An admin panel, over an invocation log

**Status:** Accepted — 2026-09-04

Amends [ADR 0006](0006-hareware-is-a-reminder-bot.md), which removed every
signed-in surface and ruled out a database of our own.

## Context

ADR 0006 was right about what HareWare should be, and two consequences of it
have since become uncomfortable.

**The bot does things nobody can see.** It posts at 8am from a cron. When it
works, the evidence is a Discord message; when it does not, there is nothing at
all — a quiet morning looks identical whether nothing published or Notion was
down. The only record is Workers Logs, which keeps three days on the free plan,
cannot be filtered by Article, and shows the real names behind pseudonymous
Bylines to anyone with dashboard access.

**Firing a reminder by hand needs a terminal.** `POST /api/reminders/run` is
guarded by a secret in a header, which means curl, which means the one person
who has the secret. That is fine for testing a change and useless for a section
editor who noticed the ping never arrived.

Neither is fatal. Both get worse as the person who built this stops being
around to answer "did it run?"

## Decision

An **admin panel**: a signed-in surface for members with the **@Editorial
Board** role, holding the invocation log and the manual triggers.

- Discord OAuth sign-in returns, from the branch ADR 0006 parked.
- Membership of @Editorial Board is checked **per request**, against Discord,
  rather than captured at sign-in.
- A **D1** database holds one row per invocation: what ran, what it decided,
  what it posted, and what failed.
- The sidebar splits into **Public tools** and **Admin tools**. The public tools
  stay open to everyone and unchanged.

## Consequences

**ADR 0006's rule about D1 holds and is the reason this is allowed.** Nothing in
it is authoritative: every row is derived from something Notion, WordPress or
Discord already knows, and dropping the database costs the club its history and
nothing else. If a row would cost information that cannot be reconstructed, it
does not belong there.

**The log is the sensitive surface.** An invocation naming an Article and its
Byline is mild; a stored request payload carries the Byline-to-Member mapping
that `CONTEXT.md` says never reaches WordPress. Summaries are kept
indefinitely, because they are small and answer "what happened last semester".
Raw payloads are pruned after thirty days by the same cron that sends the
reminders, so the sensitive half ages out on its own and the role gate protects
a shrinking window rather than a growing archive.

**Button presses are invocations too.** Every _Mark as Posted_ is already a
request to us, and it is the only record of who marked what. Recording it costs
one insert on a path that runs anyway.

**`DISCORD_BOT_TOKEN` becomes a runtime secret**, reversing what ADR 0006 and
the README say. Asking Discord whether someone holds a role needs it on every
request, so the bot must stay in the server permanently rather than only for
the setup it was originally invited for.

**Per-request role checking costs a Discord call per page view.** It was chosen
over caching the role in the session anyway: a role removed in Discord takes
effect immediately, which is the property that matters for the surface holding
the pseudonym mapping. If the panel is ever slow enough to notice, a cache
measured in minutes is the fix, not a cache measured in days.

**Revisit this if the panel grows past reading and re-running.** It is a window
onto what the bot did and a button to make it do it again. The moment it grows
an editable Article board, ADR 0006's reasoning about maintenance applies to it
in full, and this becomes the v2 that was retired.

## Alternatives considered

### Workers Logs, with the panel linking to the dashboard

Rejected. Three days of retention on the free plan, no way to filter by Article
or by day, no way to gate who reads it, and it puts real names behind
pseudonyms in front of anyone with Cloudflare access. It is the right place for
a stack trace and the wrong place for a record.

### Caching @Editorial Board membership in the session

Rejected, narrowly, and the honest runner-up. It removes a Discord call from
every page view, at the cost of a removed role staying live until the session
expires. For a surface holding the pseudonym mapping, immediate is worth the
request.

### No store: the panel shows only what a run just did

Rejected. It answers "does it work now" and not "did it work on Tuesday", which
is the question actually asked, and the one nobody can answer today.

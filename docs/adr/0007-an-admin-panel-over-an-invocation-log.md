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

> **Amended 2026-09-04.** The admin tools are shown in the sidebar to
> **everybody**, signed in or not, and a member who may not open one is told
> which of four things is true rather than served a 404. See _Refusals say what
> is wrong_ below.

## Consequences

**ADR 0006's rule about D1 holds and is the reason this is allowed.** Nothing in
it is authoritative: every row is derived from something Notion, WordPress or
Discord already knows, and dropping the database costs the club its history and
nothing else. If a row would cost information that cannot be reconstructed, it
does not belong there.

**The log is the sensitive surface.** An invocation naming an Article and its
Byline is mild; a stored request payload would carry the Byline-to-Member
mapping that `CONTEXT.md` says never reaches WordPress. Summaries are kept
indefinitely, because they are small and answer "what happened last semester".

> **Amended 2026-09-04.** The payload column was never written to, and has been
> removed along with the thirty-day prune that maintained it. Nothing about that
> was load-bearing: the summary already carries the failure text, which is what
> a payload would mostly have duplicated. The gate is unchanged and still right,
> but its justification is narrower than this section claimed — what the log
> actually holds is the summary and the `actor`, which names a real Discord user
> against every button press. That is enough to gate on; the pseudonym mapping
> is not in there, and adding it later would be the decision this paragraph
> described.

**Button presses are invocations too.** Every _Mark as Posted_ is already a
request to us, and it is the only record of who marked what. Recording it costs
one insert on a path that runs anyway.

**`DISCORD_BOT_TOKEN` becomes a runtime secret**, reversing what ADR 0006 and
the README said. Asking Discord whether someone holds a role needs it on every
request, so the bot must stay in the server permanently rather than only for
the setup it was originally invited for. The reminders reached the same
conclusion first, by moving from webhooks to posting as the bot.

**Per-request role checking costs a Discord call per page view.** It was chosen
over caching the role in the session anyway: a role removed in Discord takes
effect immediately, which is the property that matters for the surface holding
who is on the board. If the panel is ever slow enough to notice, a cache
measured in minutes is the fix, not a cache measured in days.

**Revisit this if the panel grows past reading and re-running.** It is a window
onto what the bot did and a button to make it do it again. The moment it grows
an editable Article board, ADR 0006's reasoning about maintenance applies to it
in full, and this becomes the v2 that was retired.

**Refusals say what is wrong.** _Added 2026-09-04._ The panel originally
answered every refusal with a bare 404, on the reasoning that the admin tools
should not admit to existing. That bought nothing. The repository is public, the
routes are in it, and that @Editorial Board is what gates them is visible to
anyone in the Discord's member list. What it cost was real: four different
situations — not signed in, signed in without the role, signed in with an
account that has left the server, and Discord not answering when we asked — all
rendered as the same blank "not found", and only one of them is something the
member can act on.

The last is the worst. A Discord outage made `guildMember()` return null, which
became `admin: false`, which became "this page does not exist" — served to a
board member whose access was fine, and identical on every retry. That is the
failure shape `docs/agents/silent-failures.md` is about, wearing a 404.

So: the refusal names the reason, and the member wherever Discord gave us one —
it can only say "this account" to somebody it could not look up, which is the
`not-in-server` and `unreachable` pair. It carries the status code that goes
with it: 401 signed out, 403 for the two role cases, 503 when Discord could not
be reached.

Two things follow. The sidebar shows the admin tools to everyone, because there
is nothing left to hide and hiding them is what made a member with a stale nav
click a link into a lie. And nothing about a role is served client-side any more
— `/api/session.json` answers who you are and not what you may do, because no
island needs to know.

**The guard moved to middleware**, from a line at the top of each page. Three
reasons, in the order they matter: the guard runs before any page's frontmatter,
so the check cannot be forgotten; a refused request never executes the page, so
nobody being turned away costs a D1 query; and the guard is a plain function
taking `next`, so a test can watch what it does with the answer. That last one
is the point — the status mapping is the whole change, and while it lived in an
`.astro` file nothing could assert it. The refusal is a rewrite rather than a
redirect, so the address bar still holds the page they were sent to and
reloading re-reads the answer.

**The `/admin` prefix went with the split it stood for.** _Added 2026-09-05._
The tools were at `/admin/log` while the public ones were at `/generate`, which
told a member the club's own permission model through a URL and told the sidebar
to keep two shapes of link. Every tool is now at the top level, and
`ADMIN_ROUTES` in `~/lib/admin-routes` carries what the prefix used to: the nav
builds its group from it and the guard protects exactly it, so a tool cannot be
listed without being guarded. The prefix's real virtue was that a new file under
`pages/admin/` was guarded by where it sat; what replaces that is `admitted()`,
which throws when a page renders with no admission — so the failure is loud
rather than open. The old URLs redirect, because the bot has already posted
some of them.

The gating itself is untouched. `adminAccess()` still asks Discord on every
request, and the API routes still answer a bare status code, because a caller
holding a bearer secret is not a member who needs a sentence.

## Alternatives considered

### Workers Logs, with the panel linking to the dashboard

Rejected. Three days of retention on the free plan, no way to filter by Article
or by day, no way to gate who reads it, and it puts real names behind
pseudonyms in front of anyone with Cloudflare access. It is the right place for
a stack trace and the wrong place for a record.

### Caching @Editorial Board membership in the session

Rejected, narrowly, and the honest runner-up. It removes a Discord call from
every page view, at the cost of a removed role staying live until the session
expires. For the surface that names who did what, immediate is worth the
request.

### No store: the panel shows only what a run just did

Rejected. It answers "does it work now" and not "did it work on Tuesday", which
is the question actually asked, and the one nobody can answer today.

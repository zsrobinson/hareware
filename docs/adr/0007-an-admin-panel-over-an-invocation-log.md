# 7. An admin panel, over an invocation log

**Status:** Accepted — 2026-09-04. Refusals and routes revised 2026-09-04 and
2026-09-05; folded in below.

Amends [ADR 0006](0006-hareware-is-a-reminder-bot.md), which removed every
signed-in surface and ruled out a database of our own.

## Context

**The bot does things nobody can see.** It posts at 8am from a cron. When it
works, the evidence is a Discord message; when it does not, a quiet morning
looks the same whether nothing published or Notion was down. The only record is
Workers Logs, which keeps three days on the free plan, cannot be filtered by
Article, and shows the real names behind pseudonymous Bylines to anyone with
dashboard access.

**Firing a reminder by hand needs a terminal.** The manual trigger is guarded by
a secret in a header, so only the person holding the secret can use it. That is
fine for testing a change and useless to a section editor who noticed the ping
never arrived.

Both get worse as the person who built this stops being around to answer "did it
run?"

## Decision

An **admin panel**: signed-in tools for members with the `@Editorial Board`
role, starting with the invocation log and the manual triggers.

- Discord OAuth sign-in returns, from the branch ADR 0006 parked.
- `@Editorial Board` is checked against Discord **on every request**, not
  captured at sign-in.
- A **D1** database holds one row per invocation: what ran and from where, its
  outcome (`ok`, `skipped`, `misconfigured` or `failed`), a one-line summary,
  and the Discord user behind it if there was one.
- Every tool, public or gated, lives at the top level. `ADMIN_ROUTES` in
  `~/lib/admin-routes` is the one list of gated routes; the sidebar builds its
  admin group from it and the guard protects exactly it, so a tool cannot be
  listed without being guarded. The old `/admin/…` URLs redirect, because the
  bot has already posted some of them.
- The admin tools appear in the sidebar for everybody, signed in or not.

### The guard runs in middleware

`guardAdmin` runs before any page's frontmatter, so it cannot be forgotten, and
a refused request never executes the page. It is a plain function taking `next`,
so tests can assert what it does with each answer. A gated page calls
`admitted()`, which throws if it renders without an admission, so a page whose
route is missing from `ADMIN_ROUTES` fails loudly instead of serving openly.

### Refusals say what is wrong

A refused request is rewritten, not redirected, to `/access-denied`, which names
which of four things is true and carries the matching status:

| Situation                                  | Status |
| ------------------------------------------ | ------ |
| not signed in                              | 401    |
| signed in, in the server, without the role | 403    |
| signed in with an account not in the guild | 403    |
| Discord could not be asked                 | 503    |

The first design answered every refusal with a bare 404, so that the admin tools
would not admit to existing. That hid nothing — the repository is public, and
who holds `@Editorial Board` is visible in Discord — and it cost a lot: a
Discord outage made the role lookup fail, which became "not an admin", which
became "this page does not exist", served to a board member whose access was
fine and identical on every retry. That is the failure shape
[silent-failures](../agents/silent-failures.md) is about.

The `/api/members/*` routes refuse with the same statuses as JSON. The manual
trigger, whose caller holds a bearer secret, answers with a bare status code.
`/api/session.json` answers who you are and not what you may do, because no
island needs the role.

## Consequences

**Nothing in D1 is authoritative, and that is why D1 is allowed.** Every row is
derived from something Notion, WordPress or Discord already knows; dropping the
database costs the club its history and nothing else. A row whose loss would
cost information that cannot be reconstructed does not belong there.

**The log is the sensitive surface.** Its `actor` column names the real Discord
user behind every button press and edit, which is enough to gate it. It does not
hold the Byline-to-Member mapping; storing request payloads would add that, and
would be a new decision. Summaries are kept indefinitely because they are small
and answer "what happened last semester".

**Button presses are invocations too.** _Mark as Posted_ is already a request to
us, and the log is the only record of who marked what.

**`DISCORD_BOT_TOKEN` becomes a runtime secret.** The role check needs it on
every request, so the bot stays in the server permanently.

**Every gated page view costs a Discord request.** In exchange, a role removed
in Discord takes effect on the next page load. If the panel ever feels slow, a
cache measured in minutes is the fix, not one measured in days.

**Revisit this if the panel grows an editable Article board.** At that point ADR
0006's reasoning about maintenance applies in full.

## Alternatives considered

**Workers Logs, linked from the panel.** Three days of retention, no filtering
by Article or day, no control over who reads it, and it exposes pseudonyms to
anyone with Cloudflare access. Right for a stack trace, wrong for a record.

**Caching `@Editorial Board` membership in the session.** The runner-up. It
saves a Discord call per page view, but a removed role would stay live until the
session expired.

**No store; the panel shows only what a run just did.** Answers "does it work
now" but not "did it work on Tuesday", which is the question people ask.

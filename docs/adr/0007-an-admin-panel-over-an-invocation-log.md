# 7. An admin panel, over an invocation log

**Status:** Accepted — 2026-09-04. Revised since: the panel is the archive
pages and the social reminder's page ([ADR 0011](0011-wordpress-is-the-record.md)),
and the gate runs in the APIs that hold their data, not in front of the pages
([ADR 0012](0012-static-pages-gated-data.md)). Folded in below.

## Context

**The bot does things nobody can see.** It posts at 8am from a cron. When it
works, the evidence is a Discord message; when it does not, a quiet morning
looks the same whether nothing published or something failed. The only record
was Workers Logs, which keeps three days on the free plan and cannot be filtered
by Article.

**Firing a reminder by hand needs a terminal.** The manual trigger is guarded by
a secret in a header, so only the person holding the secret can use it.

Both get worse as the person who built this stops being around to answer "did it
run?"

## Decision

An **admin panel**: signed-in tools for members with the `@Editorial Board`
role.

- Discord OAuth sign-in.
- `@Editorial Board` is checked against Discord **on every gated request**, not
  captured at sign-in.
- A **D1** database holds one row per invocation: what ran and from where, its
  outcome (`ok`, `skipped`, `misconfigured` or `failed`), a one-line summary,
  and the Discord user behind it if there was one.
- Every tool, public or gated, lives at the top level. `adminNav` in `~/lib/nav`
  is the one list of the board's tools, and the sidebar's admin group; the gate is on the APIs (ADR 0012). The old
  `/admin/…` URLs redirect, because the bot has already posted some of them.
- The admin tools appear in the sidebar for everybody, signed in or not.

### Refusals say what is wrong

A refused request names which of four things is true, with the matching status;
the gated API answers it as JSON and the page's island draws it:

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

The manual trigger, whose caller holds a bearer secret, answers with a bare
status code. `/api/session.json` answers who you are and not what you may do.

## Consequences

**Nothing in D1 is authoritative, and that is why D1 is allowed.** Every row is
derived from something WordPress or Discord already knows; dropping the
database costs the club its history and nothing else. A row whose loss would
cost information that cannot be reconstructed does not belong there.

**The log is the sensitive surface.** Its `actor` column names the real Discord
user behind every button press and edit, which is enough to gate it. It does not
hold who is behind a byline, and a log line never names one.

**Button presses are invocations too.** The reminder's "Not posted" button is a
request to us, and the log is the only record of who marked what.

**`DISCORD_BOT_TOKEN` is a runtime secret.** The role check needs it on every
gated request, so the bot stays in the server permanently.

**Every gated API call costs a Discord request.** In exchange, a role removed in
Discord takes effect on the next request. If the panel ever feels slow, a cache
measured in minutes is the fix, not one measured in days.

## Alternatives considered

**Workers Logs, linked from the panel.** Three days of retention, no filtering
by Article or day, and no control over who reads it. Right for a stack trace,
wrong for a record.

**Caching `@Editorial Board` membership in the session.** It saves a Discord
call per request, but a removed role would stay live until the session expired.

**No store; the panel shows only what a run just did.** Answers "does it work
now" but not "did it work on Tuesday", which is the question people ask.

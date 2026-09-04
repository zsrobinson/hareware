# 8. Sessions with nothing stored, and an identity read live

**Status:** Accepted — 2026-09-04

Follows [ADR 0007](0007-an-admin-panel-over-an-invocation-log.md), which brought
back sign-in and had to decide how a session is kept.

## Context

The admin pages need to know two things about whoever is asking: **who they
are**, and **whether they hold `@Editorial Board`**. Those look like one
question and are not, and conflating them is how this went wrong twice before
landing here.

The obvious shape is a session table: a row per sign-in, holding the member's id
and whatever was true about them at the time. It is also the shape that carries
the most: a table to migrate, a read on every request, rows to expire, and a
copy of somebody's name that begins going stale the moment it is written.

Better Auth was considered and would have worked. It wants a store.

## Decision

**The session cookie holds one thing: the Discord user id.** Signed with
HMAC-SHA256 over `SESSION_SECRET`, with the expiry inside the signature so a
cookie the browser kept anyway is still dead. `__Host-` prefixed, `HttpOnly`,
`Secure`, `SameSite=Lax`. Nothing is stored server-side — no table, no KV entry,
nothing to migrate or clean up. See `src/lib/session.ts`.

**Everything else about a member is read live, on every page load.** The
nickname, the avatar, and the roles all come from one
`GET /guilds/{id}/members/{user}`, which is the request the role check was
already making. Identity is therefore free: the reply carries the profile
alongside the roles, so one call answers both "may they" and "what are they
called", and the two cannot disagree. See `src/lib/member.ts` and
`src/lib/admin.ts`.

**Reading it there rather than at sign-in is the point.** The guild lookup knows
the **server nickname** — what the club calls each other, and the name beside
every message in Discord. The OAuth `/users/@me` call has no idea it exists.
Per-server avatars come along for the same reason.

**An unreachable Discord denies.** `guildMember()` returns null for every way of
not being there — no bot token, left the server, an outage — and the admin
surface answers all of them with `404`.

## Consequences

**A session cannot be revoked before it expires.** This is the real cost, and
seven days is the only bound on a stolen cookie. It is bearable because the
thing worth revoking is not the session but the role, and the role is checked
against Discord on every admin request: remove it and access is gone on the next
page load, cookie or no cookie. Rotating `SESSION_SECRET` signs everybody out,
which is the escape hatch.

**One Discord request per admin page view.** ADR 0007 already accepted this for
the role check. Identity rides along at no additional cost, and pages that
render server-side pass what they found to the sidebar so the island does not
ask again.

**A profile is not something to hold onto.** Anything that caches a display name
— in the cookie, in D1, in a module — reintroduces exactly the staleness this
avoids. An earlier attempt put the name in the cookie and was reverted for it.
If a future surface needs a name without a Discord request, that is a new
decision, not an optimisation.

**Nothing here decides admission.** `Profile` is what the UI draws. `admin` is
what the pages gate on. They arrive together and are deliberately separate
types, so a change to what is displayed cannot become a change to who gets in.

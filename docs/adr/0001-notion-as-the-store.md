# 1. Notion as the store

**Status:** Accepted — 2026-09-02

## Context

HareWare needs somewhere to keep everything WordPress has no concept of: an
Article's Status, its Image Status, its Byline and the real member behind it, the
Duty Roster, and the Members table.

Judged purely as a database, Notion is a poor choice. It rate-limits at roughly
three requests per second, its API is awkwardly property-typed, and it is an
external service that can be slow or unavailable. Vercel Postgres, Turso, or
SQLite would each be faster, simpler to query, and one fewer moving part — which
matters, because a stated goal of this project is as few dependencies that can
break as possible.

## Decision

The store is Notion anyway.

## Consequences

The reason is **operational continuity**, not data loss.

It is tempting to argue that a real database would risk losing everything. It
would not. WordPress independently holds every published Article, and that is the
half that matters — it is the club's actual archive and will outlive all of this.
What a real database would put at risk is in-flight workflow state: Status, Image
Status, the Duty Roster, the mapping from a Byline to the member behind it. A
semester's worth. Annoying and recoverable, not a catastrophe.

The real argument is narrower and holds better. **When HareWare is broken, the
club has to keep running.** If HareWare is down for two weeks in the middle of a
semester, a club member can open Notion, read the Articles table, and keep
tracking articles by hand until it is back. With a Postgres instance they can
track nothing, and the process falls back to Discord scrollback. Nobody in the
club can open a database, and the person who could has graduated.

The same reasoning would have made a Google Sheet acceptable. Notion wins over a
Sheet because the club already keeps meeting notes and public resources there,
and because Notion page IDs are stable in a way spreadsheet row numbers are not.

The price is real and gets paid daily: requests must stay within Notion's rate
limit, reads are slower than a local database, and the API is more work to use.
That cost is deliberate. It buys the continuity above, and nothing else.

## Alternatives considered

### A real database (Postgres, Turso, SQLite)

Rejected, but **not unthinkable** — and this ADR should not be read as a
prohibition. It would be faster, simpler and better-typed. It fails only the
continuity test above: there is no version of it a non-technical club member can
open during an outage.

If Notion's rate limits ever become genuinely unbearable, this is the honest
trade to reconsider. The requirement is not "must be Notion" but **"must be
something a club member can open and edit unaided."** Any replacement that clears
that bar is a legitimate successor; one that does not is a regression, however
much nicer it is to query.

### Storing everything in WordPress natively

Rejected. Technically achievable: custom fields on posts, or a custom post type,
exposed to the REST API. Because WordPress.com Premium has no SFTP, this cannot
be a small hand-written plugin — it needs a UI-driven one such as Pods (free) or
ACF. The WordPress Post would be created as a draft at pitch time rather than at
Managing Edited, and the mirror job would disappear entirely, since there would
be nothing to sync.

Four reasons against:

- It trades Notion for a **plugin dependency that is worse**. Pods becomes
  load-bearing for reading your own data, and WordPress hides custom fields in
  the block editor by default — so without it the tracker is barely readable in
  wp-admin. This fails the continuity test more badly than Notion does.
- **Pitch-time drafts clutter the real thing.** Every idea that never gets
  written becomes a permanent orphan draft sitting among actual articles.
- **Members and the Duty Roster fit badly.** They are not content, and modelling
  people as posts to make the schema work is a poor trade.
- It **concentrates load on the service that already throttles us**. HareWare
  carries retry logic for WordPress.com's 429s; routing all traffic there makes
  that worse, and Premium provides no staging site on which to find out safely.

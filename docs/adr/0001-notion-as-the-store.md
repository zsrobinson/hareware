# 1. Notion as the store

**Status:** Accepted — 2026-09-02. Reconsideration triggers extended by ADR 0006
on 2026-09-03.

## Context

HareWare needs somewhere to keep what WordPress has no concept of: an Article's
Status and Image Status, its Byline and the real member behind it, and the
Members table. (The Duty Roster was here too until ADR 0006 moved it to Discord
roles.)

Judged purely as a database, Notion is a poor choice. It rate-limits at roughly
three requests per second, its API is awkwardly property-typed, and it is an
external service that can be slow or unavailable. Postgres, Turso or SQLite
would each be faster, simpler to query, and one fewer moving part.

## Decision

The store is Notion anyway.

## Consequences

The reason is operational continuity. Data loss is not the concern: WordPress
independently holds every published Article, which is the club's real archive.
What a database of our own would put at risk is a semester of in-flight workflow
state — annoying to lose, but recoverable.

The concern is that the club has to keep running when HareWare is broken. If
HareWare is down for two weeks mid-semester, a club member can open Notion, read
the Articles table and keep going by hand. With Postgres they could do nothing:
nobody in the club can open a database, and the person who could has graduated.

A Google Sheet would pass the same test. Notion wins because the club already
keeps meeting notes and public resources there, and because Notion page IDs are
stable where spreadsheet row numbers are not.

The price is paid daily: requests stay within Notion's rate limit, reads are
slower than a local database, and the API is more work. That is deliberate.

The requirement is not "must be Notion" but **must be something a club member
can open and edit unaided**. A replacement that clears that bar is a legitimate
successor; one that does not is a regression, however much nicer it is to query.

### When to reconsider

- **If the rate limit becomes unbearable.** A real database is then the trade to
  reconsider. It fails only the continuity test above.
- **If Notion stops being free for the club.** The club runs on Notion's free
  plan for student organisations, which is goodwill rather than a contract. The
  exposure is narrower than it looks: the API is free on every tier, and
  HareWare uses no automations. The real limit is that a Free workspace with a
  second member is capped at 1,000 blocks. ADR 0006 names Google Sheets as the
  designated successor: free through the university's Workspace, and something a
  member can open and edit unaided.

## Alternatives considered

### A real database (Postgres, Turso, SQLite)

Faster, simpler and better-typed. Rejected only on the continuity test: there is
no version of it a non-technical member can open during an outage.

### Storing everything in WordPress natively

Achievable with custom fields or a custom post type, but WordPress.com Premium
has no SFTP, so it would need a UI-driven plugin such as Pods or ACF. Rejected
because:

- It makes a plugin load-bearing for reading the club's own data, and WordPress
  hides custom fields in the block editor by default. That fails the continuity
  test worse than Notion does.
- Pitch-time drafts would leave every unwritten idea as an orphan draft among
  real articles.
- Members are not content, and modelling people as posts is a poor fit.
- It concentrates load on WordPress.com, which already throttles us, with no
  staging site to test on.

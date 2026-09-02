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

The reason is not that Notion is a good database. It is that **when HareWare is
broken, the club has to keep running.** A club member can open Notion, read the
Articles table, and edit it by hand. Nobody in the club can do that with a
Postgres instance, and the person who could has graduated. The same reasoning
would have made a Google Sheet acceptable; Notion wins over a Sheet because the
club already keeps meeting notes and public resources there, and because Notion
page IDs are stable in a way spreadsheet row numbers are not.

The club has lost data before to a custom system that nobody maintained. Every
part of this design assumes HareWare will eventually be unmaintained, and is
arranged so that when that happens the data survives without it.

The price is real and gets paid daily: requests must stay within Notion's rate
limit, reads are slower than a local database, and the API is more work to use.
That cost is deliberate. It buys the escape hatch.

**Do not migrate this to a real database because the rate limits are annoying.**
The rate limits are the tax; the escape hatch is what they pay for. Removing
Notion without replacing the human-editable fallback deletes the safety property
this whole project is built on. If the tax ever becomes genuinely unbearable, the
replacement must be something a non-technical club member can open and edit
unaided.

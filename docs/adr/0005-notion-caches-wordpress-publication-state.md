# 5. Notion caches WordPress publication state, read-only

**Status:** Accepted — 2026-09-02

## Context

Status lost its `scheduled` and `published` values, because both are facts about
an Article's WordPress Post rather than steps in the club's writing process.

The club still wants to see them in Notion. That want is legitimate: the
Articles table is the surface people actually look at, and "is this live yet" is
one of the first questions anyone asks of a row.

## Decision

They come back as a separate property the mirror writes and nobody edits —
`WordPress State`: Draft / Scheduled / Published — alongside the existing
`WordPress Post ID` and `Publication Date`, plus a `Last Synced` timestamp.

Status keeps exactly its five hand-driven values: Backlog, Approved, Written,
Section Edited, Managing Edited.

## Consequences

This does not reopen the decision that removed those values from Status. What
made them unsafe was living in a hand-editable select, where a human could assert
"published" about a Post that WordPress considers a draft, and nothing could say
which was true. A separate mirror-written property has no such failure: it is a
cache of a WordPress fact and is overwritten on every sync.

The contract is that **hand edits to it are silently overwritten**. Notion has no
per-property permissions, so the property's name and the database description are
the only enforcement available.

Two limits are accepted rather than solved.

**It goes stale exactly when it is needed.** The mirror is HareWare, so during an
outage the column freezes at its last sync — the very scenario ADR 0001 exists
for. A fortnight-old publication state is still mostly right and better than an
absent one, and `Last Synced` makes the staleness legible rather than
misleading.

**Nothing in the app may read it back.** It exists for humans looking at the
table. The moment application logic branches on Notion's copy instead of asking
WordPress, the cache has become authoritative and the original problem is back.

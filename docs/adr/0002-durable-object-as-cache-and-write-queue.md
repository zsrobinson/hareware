# 2. A Durable Object as the cache and Notion write queue

**Status:** Accepted — 2026-09-02

## Context

The board shows every in-flight Article at once, and every cell on it is
editable in place. That means many small reads of the same data, and bursts of
small writes whenever an editor works through the board.

Notion rate-limits at roughly three requests per second **per integration
token** — a single global budget shared by everyone using HareWare at once, not
a per-user one. Workers isolates are created and destroyed unpredictably and
share nothing, so isolates that each rate-limit themselves politely will still
collectively exceed the limit. Module-scope memory is no use as a cache for the
same reason.

The alternatives were KV (a simple binding, eventually consistent, fine as a
read cache) or a Durable Object.

## Decision

One Durable Object holds the cached board and owns all writes to Notion. Reads
are served from its cache; writes are queued into it, batched, and drained
against the rate limit. Its alarm flushes the queue.

## Consequences

KV would have been simpler and is a perfectly good read cache, but it cannot
coordinate writes — nothing in it can serialise anything. Since the rate limit
is global, only a single coordination point can actually honour it, and the
Durable Object is the platform's answer for that. Choosing KV would have meant
adding the Durable Object later anyway, once inline editing put three editors on
the board at the same time.

SQLite-backed Durable Objects are available on the Workers **free** plan, so this
does not commit the club to a paid plan when the project moves to a club account.

The cost is a concept to learn and one more moving part in the request path. It
also becomes a bottleneck by construction — that is the point, and it is only
correct as long as there is exactly one of these objects. Sharding it by anything
would silently restore the original problem.

Note that the cache holds nothing authoritative: it is reconstructible from
Notion and WordPress at any time, so it does not make HareWare a system of
record.

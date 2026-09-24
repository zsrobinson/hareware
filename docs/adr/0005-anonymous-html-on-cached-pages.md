# 5. Anonymous HTML on cached pages

**Status:** Accepted — 2026-09-03

## Context

v2 puts everything behind one shell, so the sidebar is on every page — including
the public tools, which anyone can reach signed out. That sidebar shows more to
a signed-in member than to a visitor.

The public tools are also the pages held at the edge. `/` and the post
generator's landing set `s-maxage`, and a cache hit never reaches the worker at
all. That is not an optimisation to be traded away: it is what keeps HareWare
under wordpress.com's rate limit, which the feed pages have tripped on their own
before.

A cached response is therefore the same bytes for everyone who asks. Rendering
who you are into one would hand your name to the next visitor.

## Decision

Every page declares which of two kinds it is, and the shell renders accordingly.

**Cached** — sets a public `s-maxage`, passes no `viewer`, and ships HTML with
no session in it. The account panel is a `client:idle` island that asks
`/api/session.json`, which is never cached.

**Private** — sets `private, no-store`, resolves `viewer()` and passes it down,
so the account panel renders server-side.

`assertAnonymous()` in `~/lib/anonymous` enforces this: a page that passes a
viewer while setting a shared `cache-control` throws in development, and in
production is made private and logged.

The sidebar itself is static Astro markup wearing shadcn's classes rather than
shadcn's React sidebar, so hydration is confined to the parts that vary or move:
the account panel and the mobile drawer. (The admin tools are listed for
everybody since ADR 0007, so the nav itself no longer depends on the session.)

## Consequences

A signed-in member gets a brief signed-out sidebar on cached pages before the
island resolves. That is the price of the cache, and it is paid only on the
public tools; every page that matters to a signed-in member is private and
renders correctly on the first paint.

Every new page has to decide which kind it is. Getting it wrong is the one
mistake here with a privacy cost, which is why the check throws in development
and fails safe in production.

The public tools cost no JavaScript on desktop beyond the small islands, which
is what justified staying on Astro in ADR 0003.

**Revisit this when a public page needs to render per-member data**, or when the
rate limit stops being the reason those pages are cached. Either would make the
anonymous-HTML rule cost more than it returns, and server-rendering everything
behind a private cache would become simpler.

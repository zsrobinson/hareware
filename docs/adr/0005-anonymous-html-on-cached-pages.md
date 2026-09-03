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

**Cached** — sets a public `s-maxage`, passes `cached`, and ships HTML with no
session in it. The editorial nav and the account panel arrive from a
`client:idle` island that asks `/api/session.json`, which is never cached.

**Private** — sets `private, no-store`, passes the result of `getSession()`, and
renders both server-side.

The layout enforces this in development: a page that passes a session while
setting a public `cache-control` throws, and says which of the two ways out to
take.

The sidebar itself is static Astro markup wearing shadcn's classes rather than
shadcn's React sidebar, so hydration is confined to the parts that vary or move
— the two session-dependent regions, and the mobile drawer at `client:media`.

## Consequences

A signed-in member gets a brief signed-out sidebar on cached pages before the
island resolves. That is the price of the cache, and it is paid only on the
public tools; every page that matters to a signed-in member is private and
renders correctly on the first paint.

Every new page has to decide which kind it is. Getting it wrong is the one
mistake here with a privacy cost rather than a visual one, which is why the
check throws rather than warns.

The public tools keep costing no JavaScript on desktop beyond the two small
islands, which is what justified staying on Astro in ADR 0003.

**Revisit this when a public page needs to render per-member data**, or when the
rate limit stops being the reason those pages are cached. Either would make the
anonymous-HTML rule cost more than it returns, and server-rendering everything
behind a private cache would become simpler.

# 12. Static pages, gated data, and the Worker's 10 ms

**Status:** Accepted — 2026-11-07. Amends ADR 0007's "the guard runs in
middleware": the gate moves from the admin pages to the APIs that hold their
data.

## Context

HareWare has to fit the Cloudflare Workers free plan: 10 ms of CPU per
invocation, cron included. Waiting on fetch, D1 or Discord doesn't count; only
computation does. Cloudflare tolerates the odd overrun but stops a Worker that
goes over consistently, so the typical request on every route has to sit well
under it.

It didn't. Cloudflare's own `cpuTimeMs` for production, and timings on this
branch against the real 418 posts:

- `/generate?article=` 96 ms at the median; `/email` 147 ms; the hourly cron
  27 ms; bot 404s for `robots.txt` and `.env` probes 10–160 ms.
- `buildArchive` 26–51 ms on every `/api/archive.json`, even with WordPress
  cached; reading WordPress after a cache miss (JSON.parse of 2.2 MB, then
  `paragraphs()`) 49–68 ms; any dashboard render 8–14 ms warm, more cold;
  linkedom on the rendered-page fallback about 45 ms.

The site is served from workers.dev, where the Cache API does nothing, so the
edge cache cannot be relied on to keep the WordPress read rare.

## Decision

**No request does heavy work in the Worker.**

1. **Every page is a static file.** 404, sign-in, access-denied, generate,
   words, magazine, email, random, custom and the admin pages are prerendered
   and served from the asset server without waking the Worker. Only `/api/*`
   and `/auth/*` reach it (`run_worker_first`); an address that is neither and
   matches no file gets `404.html` from the asset server
   (`not_found_handling`), so crawlers and probes cost nothing. `robots.txt`
   asks crawlers to stay away, and `_headers` carries the security headers the
   middleware sets on the Worker's own routes.

2. **The browser reads WordPress.** Its REST API answers CORS for any origin.
   Articles are parsed with the browser's own `DOMParser`, whose documents are
   inert, and the same scrubber runs before anything reaches the page. The
   rendered-page fallback is gone: a page can't be fetched cross-origin, and
   WordPress.com's throttle is per address, so readers' own addresses are less
   likely to meet it than one Worker was. When it does refuse, the pages say
   WordPress is busy and to try again in a minute, rather than calling the
   link bad. linkedom is a dev dependency now, for the tests only.

   The requests themselves go through `/api/wordpress` first. A browser's
   cross-origin request carries an `Origin` header, and WordPress.com answers
   any request with one from its server rather than its cache: about 400 ms
   for an article, against about 130 ms cached. The pass-through asks without
   one and streams the answer back unread, which costs the Worker about what
   a refusal does, and the browser reuses the connection it already has. It
   passes two collections and the query keys the pages use; when it fails,
   the browser asks WordPress itself.

3. **The browser builds the archive.** `/api/archive.json` returns only what
   needs a secret: the Sheet, behind the gate. The archive page asks it first,
   so someone it refuses never downloads WordPress; it then reads WordPress,
   keeps the parsed read in the browser's Cache Storage, and
   builds the archive. The label pattern is compiled once per build rather
   than twice per post, and the pairwise similar-names check, nearly half the
   build, runs only on Problems and compares only names close in length.

4. **The Sheet client lives at module scope**, so its OAuth token is reused
   until it expires rather than signed again on every request.

5. **The cron stays small**: the posts-since read (no bodies), one Discord post
   and one D1 write.

### The gate moves from pages to data

An empty shell leaks nothing, so the admin pages are no longer guarded. The
gate is on the APIs that hold the data: `/api/archive.json`, `/api/sheet`,
`/api/reminder.json`, `/api/access.json` and `/api/automations/run` each ask
`adminAccess` before answering, and refuse with the same four denials and
statuses as before. A refusal comes back as JSON naming the denial and the
viewer, and the page's island draws the same message the guard used to rewrite
to. `/access-denied` stays, as a static page that asks `/api/access.json`.

`nav.test.ts` holds this: every admin route is a prerendered page that reads
nothing on the server, every listed API asks `adminAccess(request)`, and any API
route that touches the Sheet or the log is on that list. The one exception is
the Discord interactions endpoint, which Discord signs and which hands nothing
back.

## Consequences

- What a member without the role could see is unchanged: the pages say who
  they are and why not, and every byte of board data still comes from a gated
  API. A shell's HTML is the same for everyone, so it can be cached and
  prefetched like any static file.
- Pages appear immediately and fill in; a reader's browser does the parsing.
  The archive's first load reads five pages of WordPress; after that the
  stored read opens every admin page without it. Under ten minutes old it is
  used as it is; up to a day old it is shown at once and replaced by a fresh
  read made behind it.
- Every island reads through one TanStack QueryClient
  (`~/lib/query-client`), which Astro's client router keeps between pages:
  an article read on hover is there when the slides open, the list is there
  on the way back, and the archive moves between its pages without reading
  or building again. The archive pages say how old what they show is, and
  when they are checking WordPress for newer behind it.
- A page can no longer redirect on the server. Instagram Posts and InDesign
  Export rewrite their own address to the short `?article=slug` form.
- The old admin URLs (`/automations`, `/log`, `/commands` and their `/admin/`
  forms) are static redirects to `/reminder`.
- Verify with Workers Logs: group `$workers.cpuTimeMs` by `$metadata.trigger`
  over a few days. Every route's p50 should be well under 10 ms and its p90
  under 10 ms.

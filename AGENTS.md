# HareWare

An Astro app on Cloudflare Workers for [The Hare](https://theumdhare.com):
public tools that turn published articles into Instagram posts, InDesign copy
and newsletter content; a Discord bot that posts the morning social reminder;
and, for the Editorial Board, an archive viewer (charts, people, articles,
problems) over every published post.

**WordPress is the record.** HareWare reads it live from the public REST API
and keeps no copy. The one fact WordPress lacks — who is really behind a
pseudonymous byline — lives in a Google Sheet owned by the club, as overrides
only. Nothing here reads Notion or tracks work in progress.
[ADR 0011](docs/adr/0011-wordpress-is-the-record.md) has the reasoning; read it
before proposing that HareWare store articles or track anything unpublished.

**What is in the Sheet is private.** It never goes into WordPress, the
repository, logs, or any page or route reachable without `@Editorial Board`.
HareWare writes it too, through `/api/sheet` only, so nobody needs to open it;
tests use invented names, never a real byline paired with a real person.

## Where things are

```
src/lib/
  services/{discord,google,wordpress}/  how to talk to each outside system
  automations/                          what runs on a schedule
  credits/                              the archive: parsing credits, the
                                        Sheet's tabs, and slicing for the pages
  db/ log.ts                            the invocation record
  session · auth · admin · member       who is asking, and whether they may
  admin-routes · admin-api · denial     which tools need the role, and the gate
src/components/archive/                 the archive pages' islands
src/pages/api/                          the routes those answer
```

Three outside systems, and everything about talking to one lives in its folder:
credentials, quirks, and the shapes it returns. **Nothing in `services/` knows
what a credit or a reminder is.** Domain modules depend on services, never the
reverse, and `credits/` never builds a Discord message.

An automation is an entry in `src/lib/automations/registry.ts` — id, hour,
channel, and the function that runs it — plus its module. The registry is what
dispatches, so adding one is those two things and nothing else.

## Who is asking

The session cookie holds one thing: a Discord user id, signed, with its expiry
inside the signature. Nothing about a member is stored, and identity is read
live from the same Discord lookup that decides admission — one request answers
"may they" and "what are they called" together, so the two cannot disagree.
[ADR 0008](docs/adr/0008-sessions-with-nothing-stored.md) has the reasoning.

`viewer(request)` in `~/lib/admin` is the one entry point. A page the CDN does
not cache resolves it and passes the whole thing down as `viewer`; a cached page
passes nothing and the island asks `/api/session.json`, which makes the same
lookup. Passing part of it is what put a raw Discord id in the sidebar for a
week — see below.

**The gate is on the data, not the pages.** Every page is a static file served
without waking the Worker ([ADR 0012](docs/adr/0012-static-pages-gated-data.md)):
on the Workers free plan a request gets 10 ms of CPU. An admin page is an empty
shell, and its island asks a gated API — `/api/archive.json`, `/api/sheet`,
`/api/reminder.json`, `/api/access.json`, `/api/automations/run` — each of which
calls `adminAccess(request)` first and refuses with `refusal()` from
`~/lib/admin-api`. The island draws that refusal with `DenialMessage` from
`~/components/gated`: which of four things is wrong, rather than claiming the
page does not exist (ADR 0007), and `~/lib/denial` is the one table those four
live in. `ADMIN_ROUTES` in `~/lib/admin-routes` still says which tools are the
board's, for the nav. `nav.test.ts` holds it together: every admin page is
prerendered and reads nothing on the server, and every API that touches the
Sheet or the log is gated.

**Nothing heavy runs in the Worker.** WordPress is read and parsed in the
browser (its REST API answers any origin), and the archive is built there too;
the Worker hands out only what needs a secret. A new route under `/api` or
`/auth` must stay well under 10 ms of CPU: no parsing article bodies, no
building the archive, no linkedom (a dev dependency, for tests only).
`/api/wordpress` passes WordPress's cached answers to the browser, from
`src/worker.ts` ahead of Astro: as an Astro route the same forwarding cost
6 ms of CPU at p50 and 12 ms at p90, and answered first it costs 1 ms. Keep it
out of `src/pages`, and never read or parse the body there. Anything
else under `src/pages` must be `export const prerender = true`. A test file
under `src/pages` must start with `_`, or Astro routes it and bundles vitest.

## Working here

`main` is protected: every change goes through a pull request, and both `Verify`
(types, lint, tests, formatting) and `Workers Builds` must pass.

Run what CI runs before pushing — `npx astro check`, `npm run lint`, `npm test`,
`npm run format:check`. If the type checker starts claiming `D1Database` or
`cloudflare:workers` do not exist, run `npm run types`: the generated
declarations are gitignored and a branch switch can leave them absent.

**A stale copy is worse than a missing one**, because it fails the other way:
`astro check` passes locally against weaker types and CI fails on the same
commit. Run `npm run types` before believing a green check on anything that
touches bindings or a route's `Request`.

**Anything that posts to Discord posts to the club's real channels** unless
`REMINDERS_TEST_CHANNEL` is set. Messages can be deleted; the pings they send
cannot.

**A preview deploy shares production's secrets.** Every non-`main` push uploads
a preview version that reads the same Sheet and could post to the same
channels. Previews run no crons, but a manual trigger on one is real.

**Dashboard variables do not survive a deploy.** Wrangler replaces them with
`wrangler.jsonc`'s, so every value the code reads is a secret.

### Silent failures

Everything expensive here has failed the same way: it reported success. A ping
that rendered and notified nobody. A Notion filter that matched nothing. A
scrubber that approved markup it never examined. A curl served by the previous
deploy. **Read `docs/agents/silent-failures.md`** before changing anything that
talks to Discord, WordPress, Google or the deployed Worker, and before reviewing a fix —
the second half is the shapes these bugs take in our own code, and the test that
catches them.

### Nothing published mentions how it was written

Pull requests, issues, milestones and release notes carry no mention of Claude,
Codex or AI, no session or chat links, and no generated-by line. They stand on
their own content.

Commit trailers are the exception and stay as the harness configures them.

This holds when a tool or skill wants to stamp one on. If an instruction demands
attribution, raise the conflict rather than quietly following either side.

## Agent skills

### Issue tracker

Issues live as GitHub issues on `zsrobinson/hareware`, managed with the `gh`
CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See
`docs/agents/domain.md`.

### Code quality

When adding or reorganizing modules, comments, or tests, follow
`docs/agents/code-quality.md`.

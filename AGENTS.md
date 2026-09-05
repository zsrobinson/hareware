# HareWare

An Astro app on Cloudflare Workers for [The Hare](https://theumdhare.com):
public tools that turn published articles into Instagram posts, InDesign copy
and newsletter content, plus a Discord bot that posts the club's recurring
reminders on a cron.

HareWare does **not** integrate with the article tracker, and proposals that it
should are answered by
[ADR 0006](docs/adr/0006-hareware-is-a-reminder-bot.md). Read it first.

## Where things are

```
src/lib/
  services/{discord,notion,wordpress}/  how to talk to each outside system
  automations/                          what runs on a schedule
  articles/                             Article behavior and Notion's shapes
  db/ log.ts                            the invocation record
  session · auth · admin · member       who is asking, and whether they may
  admin-routes · admin-guard · denial   which tools need the role, and the gate
src/pages/api/                          the routes those answer
```

Three outside systems, and everything about talking to one lives in its folder:
credentials, quirks, and the shapes it returns. **Nothing in `services/` knows
what a reminder is**, so a watcher or a slash command can reach for the same
client the automations use.

Discord payloads and presentation stay in `services/discord`; Article behavior
stays in `articles`. Dependencies point from the Discord adapter into Article
modules, never back from Article modules into Discord.

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

**No admin page guards itself.** Every tool lives at the top level, public and
gated alike — `ADMIN_ROUTES` in `~/lib/admin-routes` is the only thing that says
which is which, and both the nav and the guard read it, so a tool in the sidebar
is a tool that is guarded. `nav.test.ts` holds those to each other.

The middleware runs `guardAdmin` from `~/lib/admin-guard`: it resolves the
viewer once, leaves it in `locals.admission`, and rewrites anybody it refuses to
`/access-denied` with the status that fits — 401, 403 or 503. A gated page calls
`admitted(Astro.locals)`, which hands back the member or throws, so reaching the
page is the permission, and a page added to `src/pages/` without being added to
`ADMIN_ROUTES` fails loudly rather than quietly serving. A refusal says which of
four things is wrong rather than claiming the page does not exist; ADR 0007's
amendment is why, and `~/lib/denial` is the one table those four live in.

`~/lib/admin-guard` must not import `~/lib/admin` at the top level. Middleware
is in every route's module graph, the prerendered `/custom` is built by node,
and node cannot load a `cloudflare:` url — the import lives inside the guard,
past the route check. `npm run build` is what catches a regression here, and it
is why `admin-routes` and `denial` import nothing.

## Working here

`main` is protected: every change goes through a pull request, and both
`Verify` (types, lint, tests, formatting) and `Workers Builds` must pass.

Run what CI runs before pushing — `npx astro check`, `npm run lint`,
`npm test`, `npm run format:check`. If the type checker starts claiming
`D1Database` or `cloudflare:workers` do not exist, run `npm run types`: the
generated declarations are gitignored and a branch switch can leave them absent.

**A stale copy is worse than a missing one**, because it fails the other way:
`astro check` passes locally against weaker types and CI fails on the same
commit. Run `npm run types` before believing a green check on anything that
touches bindings or a route's `Request`.

**Anything that posts to Discord posts to the club's real channels** unless
`REMINDERS_TEST_CHANNEL` is set. Messages can be deleted; the pings they send
cannot.

### Silent failures

Everything expensive here has failed the same way: it reported success. A ping
that rendered and notified nobody. A Notion filter that matched nothing. A
scrubber that approved markup it never examined. A curl served by the previous
deploy. **Read `docs/agents/silent-failures.md`** before changing anything that
talks to Discord, Notion or the deployed Worker, and before reviewing a fix —
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

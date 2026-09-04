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
  db/ log.ts                            the invocation record
  session · auth · admin · member       who is asking, and whether they may
src/pages/api/                          the routes those two answer
```

Three outside systems, and everything about talking to one lives in its folder:
credentials, quirks, and the shapes it returns. **Nothing in `services/` knows
what a reminder is**, so a watcher or a slash command can reach for the same
client the automations use.

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

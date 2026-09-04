# HareWare

An Astro app on Cloudflare Workers for [The Hare](https://theumdhare.com):
public tools that turn published articles into Instagram posts, InDesign copy
and newsletter content, plus a Discord bot that posts the club's recurring
reminders on a cron.

HareWare does **not** integrate with the article tracker, and proposals that it
should are answered by
[ADR 0006](docs/adr/0006-hareware-is-a-reminder-bot.md). Read it first.

## Working here

`main` is protected: every change goes through a pull request, and both
`Verify` (types, lint, tests, formatting) and `Workers Builds` must pass.

Before pushing, run what CI runs — `npx astro check`, `npm run lint`,
`npm test`, `npm run format:check`. If the type checker starts claiming
`D1Database` or `cloudflare:workers` do not exist, run `npm run types`: the
generated declarations are gitignored and a branch switch can leave them absent.

**Anything that posts to Discord posts to the club's real channels** unless you
set `REMINDERS_TEST_CHANNEL`. See below before running one.

### Silent failures

The traps that report success: a ping that renders and notifies nobody, a Notion
date filter that matches nothing, a deploy that has not landed yet, a variable
typed by an untracked file. Read `docs/agents/silent-failures.md` before
changing anything that talks to Discord, Notion, or the deployed Worker.

## Agent skills

### Issue tracker

Issues live as GitHub issues on `zsrobinson/hareware`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

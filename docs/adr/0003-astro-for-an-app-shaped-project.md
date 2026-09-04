# 3. Astro, for a project that is becoming an app

**Status:** Superseded by [ADR 0006](0006-hareware-is-a-reminder-bot.md) — 2026-09-03

> The premise — that v2 turns this into app-shaped work — did not happen. With
> no editable board, "should we leave Astro" is trivially answered no. `nuqs`
> and TanStack Table were never installed and are not needed.

## Context

HareWare began as a mostly-static tool that turned an article link into
Instagram slides. v2 adds an editorial board: one dense table where every cell is
editable in place, with filtering, sorting and URL-encoded view state.

That is app-shaped work, and Astro is a content framework. The obvious question
is whether to move to something built for applications — TanStack Start, React
Router in framework mode, or Next.js.

## Decision

Stay on Astro. Add `nuqs` for type-safe search-param state, and TanStack Table
for the board.

## Consequences

The reason this is not a fight against the framework is that v2 has **one**
interactive surface, not many. A dense island on an otherwise static site is
precisely Astro's model, and the existing public tools genuinely benefit from it.

The pull toward TanStack Start was really a pull toward typed search params,
which those two things get conflated by. `nuqs` supplies that on its own, and is
documented for Astro islands via its React SPA adapter — it takes
`serverSearch={Astro.url.search}` so server-rendered islands do not flash default
values.

Astro's Cloudflare adapter is maintained by Astro's core team, which matters more
here than framework ergonomics: this project assumes stretches with nobody
maintaining it, so the boring, well-supported option beats the better-fitting
young one. TanStack Start is the natural destination if that calculus changes.

**Revisit this when there are three or more stateful dashboard routes that want
client-side navigation and shared state between them.** Until then Astro is
earning its place, and a second migration on top of the move to Cloudflare would
risk stalling the whole effort.

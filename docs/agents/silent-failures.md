# Silent failures

The traps in this codebase that report success. Each one here cost real time,
and none is discoverable by reading the config — the API returns `200`, the
build goes green, the tests pass, and the thing you wanted did not happen.

Read this before changing anything that talks to Discord, WordPress, Google,
or the deployed Worker.

The habit all of them argue for: **verify, don't infer.** Every entry below was
first diagnosed wrongly from a plausible guess, and settled by going and
looking. When you find yourself reasoning about what an API did, go and ask it.

## Discord

**A role mention renders whether or not it notified anyone.** Discord draws
`<@&id>` as a pill regardless, and only highlights it for people it actually
reached. A reminder mentioning `@Editorial Board` in grey has been posted,
rendered, and dropped on the way to everyone in it. The bot needs **Mention
@everyone, @here, and All Roles**, or the role must be Mentionable. Webhooks are
exempt from this, which is why the pings worked before the switch to posting as
the bot and stopped after it, with no code change to blame.

**`allowed_mentions` does not gate a mention inside a Components V2 text
display.** An empty `roles` array notifies the role exactly as though the field
were absent. The only way not to ping is not to write the markup — `defuse()` in
`src/lib/services/discord/post-message.ts` is that, and it is why
`REMINDERS_NO_PING` rewrites the text rather than clearing a field.

**A button missing `custom_id` invalidates the whole message.** Discord refuses
to render it rather than dropping the button, so an interaction response that
strips `custom_id` while editing a message shows the user "HareWare didn't
respond in time" — even though the endpoint returned `200` with a body Discord
read. `togglePosted()` keeps the id for this reason.

## WordPress

**WordPress.com throttles what its cache cannot answer, per address, and says
nothing about it.** No limit is documented. A dozen uncached requests at once
from one address drew 429s; the same through the Worker, which leaves from
Cloudflare's many addresses, drew none; cached answers are never refused
(2026-11-08). The 429 is a small HTML page from its edge with no
`Retry-After`, no rate-limit headers and no CORS headers, and a throttled
WordPress has also answered `200` with an HTML page. So every read goes through
`readWordPress()`, retries on waits of our own choosing, and `jsonOf()` turns a
body that is not JSON into `Throttled`, never "no posts".

**In a browser, its 429 is a failed fetch.** With no CORS headers the page sees
`TypeError: Failed to fetch`, not a status. `readWordPress()` counts a failed
fetch as a refusal and ends in `Throttled`, which the pages word as "WordPress
is busy", never as a bad link.

**Any `Origin` header skips WordPress.com's cache; no-cache headers do not.** A
browser's cross-origin request always sends one, so it reaches WordPress's
server: about 400 ms for an article against about 130 ms cached, and it counts
against that address's allowance. `x-ac: BYPASS` in the response shows it.
`Cache-Control: no-cache` and `Pragma: no-cache` are ignored (`x-ac: HIT`). So
browser reads go through `/api/wordpress`, which asks without an Origin, and a
read that must be current (`{ fresh: true }`, Refresh after a fix in
WordPress) goes the same way with `fresh=1`, which the pass-through turns into
a query key WordPress has never seen.

**`after` compares against the site's local date, whatever offset you give
it.** The reminder asks for a day earlier than it needs and compares
`date_gmt` itself. `date_gmt` has no zone marker either; `Date.parse` reads it
as local time unless a `Z` is appended, which `toPost()` does.

**`x-wp-totalpages` is absent on an empty result.** Read naively it is `NaN`,
which goes into a URL. `readPage()` treats a missing header as one page.

## Google Sheets

**A tab that does not exist and a tab with no rows are different answers.**
`Sheets.read()` leaves a missing tab out of its result rather than returning
`[]`, so a renamed `Overrides` tab is reported, not read as "no overrides".

**A Sheet that cannot be read must not look like an empty one.** `readSheet()`
returns `{ status: "failed" }`, and every archive page says so in a banner,
because otherwise every pseudonym would quietly count as its own person.

**A save rewrites the tab, so it must not lose what it did not mean to
change.** `rewrite()` in `src/lib/credits/sheet.ts` reads the tab, changes only
its own rows, keeps every other row — including ones it cannot parse — and
writes back in the tab's own column order. `Sheets.replace()` writes over the
top before clearing the tail, so a save cut off halfway leaves a stale row
rather than an empty tab.

**The log must never learn a real name.** A Sheet change is logged through
`describeEdit()`, which names the kind of change and the post id only;
`edits.test.ts` fails if a name gets into it.

**A service account sees only what is shared with it.** Google answers `403`
or `404` for a Sheet that exists but was not shared, and the setup button
shows Google's own message, which names the cause.

## Cloudflare and Astro

**Cron triggers are UTC and do not observe DST.** The pattern here is an hourly
tick with an Eastern hour gate — see `easternNow()` and `REMINDER_HOUR`. Check
any new schedule against both 2am transition days: an Eastern hour can occur
twice or not at all.

**A deploy does not take effect when `wrangler deploy` returns.** A request
issued straight afterwards is often served by the previous version, which reads
exactly like the change not working. Poll until the response proves the new code
is live before concluding anything about it.

**`locals.runtime.env` was removed in Astro v6.** Its getter now exists only to
throw. Read `import { env } from "cloudflare:workers"` instead.

**A page that is not prerendered is the 404 page in production.** Only `/api/*`
and `/auth/*` reach the Worker (`run_worker_first`); anything else the asset
server answers from files, and a page with no file gets `404.html`. Under
`astro dev` the same page renders fine. `nav.test.ts` checks every page sets
`export const prerender = true`.

**A route in `src/pages` pays for Astro's pipeline.** `/api/wordpress` as an
Astro route cost 6 ms of CPU at p50 and 12 ms at p90 to forward a response
unread; answered in `src/worker.ts` before Astro it costs 1 ms. And a test file
under `src/pages` without a leading `_` is a route: one put vitest in the
Worker bundle.

**Previews are not in Workers Logs.** Traffic to a preview version is counted
only by the GraphQL Analytics API (`workersInvocationsAdaptive`, filtered by
`scriptVersion`). A short measurement there can also undercount: answers
Cloudflare's edge serves from cache never reach the Worker, so send uncached
requests when the question is what one run costs.

**`wrangler types` reads `.dev.vars`.** Whatever is in that untracked file is
added to the generated `Env`, so a variable can type check on one machine and
nowhere else. `SESSION_SECRET` and `DISCORD_CLIENT_SECRET` were typed this way
for weeks. Every variable the code reads belongs in `HareWareEnv` in
`src/env.d.ts`.

## Testing against the real thing

`#instagram-posting` is the club's real channel, and the channel ids are compiled into `src/lib/automations/config.ts` rather than
supplied per environment — so a local run with no other setting posts to them
for real. Messages can be deleted; the pings they send cannot be taken back.

Set `REMINDERS_TEST_CHANNEL` in `.dev.vars` before running anything that posts.

Against production, `POST /api/automations/run?dry=1` reports what each reminder
would post without posting it, and `?silent=1` posts without notifying. Neither
`REMINDERS_DRY_RUN` nor `REMINDERS_NO_PING` is set in production, deliberately,
so that the real 8am run works — which means an unqualified manual trigger is a
real post to a real channel.

---

# The shapes they take in our own code

The entries above are other people's systems. These are ours, and every bug this
project has had is one of two shapes. Both type check. Both return `200`.

## Two representations of one fact, allowed to disagree

Whenever a fact is written down twice, the two copies eventually differ, and
nothing announces it. Every one of these shipped:

- Three module globals and one shared "already asked" flag — the sidebar showed
  a raw Discord id, on three pages, for as long as the session lasted.
- `session` and `profile` as separate props — a page could pass half an answer,
  and two of them did.
- A registry that described the automations while the runner kept its own array
  — each one's name came from its **array position**, so reordering two lines
  would have relabelled every log row.
- `validate(input)` returning `normalize(input)` — the open redirect. The check
  and the emitted value were different strings.
- A scrubber walking _elements_ while browsers parse _nodes_ — comments were
  never inspected, so it approved markup it had not examined.
- `scrub` dropping `<meta>` while the caller read `og:image` out of one — the
  featured image was silently always missing.
- `env.d.ts` describing a flag as doing the thing the codebase had already
  proved it does not do.

**The fix is always the same: make it impossible to hold half.** One prop
carrying the whole viewer. The function living on the registry entry. Checking
the string you are about to emit rather than the one you received.

## Absence encoded as a falsy value

`undefined`, `null`, `""`, `0` and `NaN` all mean "nothing" — so a value that is
legitimately empty becomes indistinguishable from one that failed to arrive:

- `undefined` meaning both "not asked yet" and "asked, and nobody is signed in",
  which let seeding cancel the fetch that would have completed the answer.
- An empty `<channel></channel>` parsing to `""`, so a genuinely quiet day
  reported a WordPress failure.
- A missing `x-wp-total` making an offset `NaN`, which went into a URL.
- Four outcomes flattened into `ok`, so a week of rate limiting wrote seven
  green rows in the log that exists to tell a quiet morning from a broken one.

**Make absence a state.** `{ status: "unknown" } | { status: "resolved", … }`
costs three lines. `ok | skipped | misconfigured | failed` costs a type.

# The test that catches them

A helper can be perfectly tested while nothing checks that anything calls it.
Deleting `inert()` from the social ping left all 126 tests passing — the fix was
covered, the wiring was not.

> **A fix is not tested until deleting the fix fails a test.**

Check it the direct way: remove the fix, watch the suite go red, put it back.
That is thirty seconds, and it is the difference between a test that describes
the fix and one that defends it.

Two places this bites hardest here. **Mocking the boundary you are testing** —
mocking `postMessage` wholesale means nothing asserts what the message
contained. And **the D1 path**, where `record()` returns early on a missing
binding, so a test passing `{} as Env` walks up to the interesting part and
stops. Mock `~/lib/log` and assert the row instead.

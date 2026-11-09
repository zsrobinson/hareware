import { handle } from "@astrojs/cloudflare/handler";
import { runScheduled } from "~/lib/automations/run";
import { passThrough } from "~/lib/services/wordpress/pass-through";
import { STATS_THROUGH } from "~/lib/services/wordpress/stats";
import { PASS_THROUGH } from "~/lib/services/wordpress/urls";
import { answerStats } from "~/lib/stats-api";
import "./middleware";

/*
  Every route the Worker serves, loaded at startup. Startup has its own limit
  (a second, once per isolate) and is not billed to any request, but a module
  first imported during a request is, and Astro imports each route lazily.
  Measured on the preview (2026-11-07, about 150 requests each), this moved
  p90 from 4.1 ms to 3.4 ms and left the outliers where they were: a fresh
  isolate's first request still costs 10-13 ms, most likely the runtime
  compiling what it runs for the first time rather than the imports. Tests
  under src/pages start with _.
*/
import.meta.glob(["./pages/api/**/*.ts", "./pages/auth/**/*.ts", "!**/_*"], {
  eager: true,
});

/*
  the adapter's own entrypoint is `{ fetch: handle }` and nothing else, so a
  cron trigger has nowhere to land — cloudflare invokes `scheduled()`, which it
  does not export. this file is that entrypoint plus the scheduled handler.

  `main` in wrangler.jsonc points here instead of
  `@astrojs/cloudflare/entrypoints/server`. do not use both: the adapter's
  handler must be the one serving requests, or bindings and `locals` never
  reach the astro pipeline
*/
export default {
  fetch(request, env, ctx) {
    /* WordPress's cached answers for the browser, ahead of Astro: the
       pipeline is not needed to forward a GET, and every request here is
       held to 10 ms of CPU (ADR 0012) */
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.startsWith(PASS_THROUGH))
      return passThrough(url);
    /* the same for Jetpack's view counts, behind the gate */
    if (request.method === "GET" && url.pathname.startsWith(STATS_THROUGH))
      return answerStats(request);
    return handle(request, env, ctx);
  },

  /*
    not async: `waitUntil` is what keeps the isolate alive for the run, and
    awaiting here as well would only make the tick wait on work cloudflare is
    already tracking
  */
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env));
  },
} satisfies ExportedHandler<Env>;

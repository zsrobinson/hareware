import { handle } from "@astrojs/cloudflare/handler";
import { runScheduled } from "~/lib/automations/run";
import "./middleware";

/*
  Every route the Worker serves, loaded at startup. Startup has its own limit
  (a second, once per isolate) and is not billed to any request, but a module
  first imported during a request is: Astro imports each route on its first
  request in an isolate, and on a site this quiet most isolates are fresh, so
  that first request paid 5-15 ms of the 10 ms (ADR 0012). Loaded here, the
  route's own import later finds it ready. Tests under src/pages start with _.
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
  fetch: handle,

  /*
    not async: `waitUntil` is what keeps the isolate alive for the run, and
    awaiting here as well would only make the tick wait on work cloudflare is
    already tracking
  */
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env));
  },
} satisfies ExportedHandler<Env>;

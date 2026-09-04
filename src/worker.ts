import { handle } from "@astrojs/cloudflare/handler";
import { runScheduled } from "~/lib/reminders/run";

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

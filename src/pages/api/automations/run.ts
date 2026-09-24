import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { adminAccess } from "~/lib/admin";
import { DENIALS } from "~/lib/denial";
import { easternNow } from "~/lib/eastern";
import { ALL, runAutomations, type Which } from "~/lib/automations/run";
import { automation } from "~/lib/automations/registry";
import { refreshCommands } from "~/lib/services/discord/refresh-commands";

export const prerender = false;

/** a constant-time comparison */
function matches(given: string, expected: string) {
  if (given.length !== expected.length) return false;

  let difference = 0;
  for (let i = 0; i < given.length; i++) {
    difference |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return difference === 0;
}

/*
  Fires the automations by hand: a bearer secret from a terminal, or an
  @Editorial Board session from the panel. The secret goes in the header
  because Cloudflare logs urls.
*/
export const POST: APIRoute = async ({ request }) => {
  const expected = env.REMINDERS_TRIGGER_SECRET;

  if (!expected) {
    return new Response("manual trigger is not configured", { status: 404 });
  }

  const given = request.headers.get("authorization")?.replace(/^Bearer /, "");
  let actor: string | undefined;

  if (!(given && matches(given, expected))) {
    const access = await adminAccess(request);
    /* the admin pages' statuses, so an outage is a 503 and not a refusal */
    if (!access.allowed) {
      const { status, title } = DENIALS[access.denial];
      return new Response(title, { status });
    }
    actor = access.who.session.discordUserId;
  }

  const query = new URL(request.url).searchParams;

  /* `?sync=1` refreshes the command surface only, and runs no automation */
  if (query.get("sync")) {
    const sync = await refreshCommands(env);

    return Response.json(
      { sync },
      { status: sync.outcome === "failed" ? 500 : 200 },
    );
  }

  /* `?only=<id>` fires one; all by default */
  const only = query.get("only");
  if (only && !automation(only)) {
    return new Response(`unknown automation: ${only}`, { status: 400 });
  }

  const which: Which = only ? new Set([automation(only)!.id]) : ALL;

  /* `?dry=1` posts nothing and `?silent=1` pings nobody, for this request only
     (docs/agents/silent-failures.md) */
  const options: Env = {
    ...env,
    ...(query.get("dry") ? { REMINDERS_DRY_RUN: "1" } : {}),
    ...(query.get("silent") ? { REMINDERS_NO_PING: "1" } : {}),
  };

  const report = await runAutomations(
    options,
    easternNow(new Date()),
    which,
    "manual",
    actor,
  );

  return new Response(JSON.stringify(report, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
};

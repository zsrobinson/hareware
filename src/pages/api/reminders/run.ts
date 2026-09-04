import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { easternNow } from "~/lib/eastern";
import { runReminders, type Which } from "~/lib/reminders/run";

export const prerender = false;

/**
 * compares without leaking, through timing, how much of a guess was right.
 *
 * length is compared first and separately because it cannot be hidden anyway —
 * the loop below has to stop somewhere
 */
function matches(given: string, expected: string) {
  if (given.length !== expected.length) return false;

  let difference = 0;
  for (let i = 0; i < given.length; i++) {
    difference |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return difference === 0;
}

/*
  fires the reminders by hand, so one can be seen without waiting for 8am.

  a POST rather than a GET because it posts to discord — nothing that changes
  the world should be reachable by a link somebody pastes. the secret travels in
  the Authorization header rather than the url, which cloudflare logs

  this is one-shot on purpose. an environment variable that forces a reminder
  would be standing state, and a worker cannot unset its own env, so it would
  keep firing every hour until a human remembered to remove it
*/
export const POST: APIRoute = async ({ request }) => {
  const expected = env.REMINDERS_TRIGGER_SECRET;

  // unset means the trigger does not exist, rather than that it is open
  if (!expected) {
    return new Response("manual trigger is not configured", { status: 404 });
  }

  const given = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!given || !matches(given, expected)) {
    return new Response("unauthorized", { status: 401 });
  }

  const query = new URL(request.url).searchParams;

  /*
    `?only=meeting` or `?only=social` to fire one; both by default. the reminders
    themselves decide there is nothing to say on a quiet day, so firing both is
    safe
  */
  const only = query.get("only");
  if (only && only !== "meeting" && only !== "social") {
    return new Response(`unknown reminder: ${only}`, { status: 400 });
  }

  const which: Which = {
    meeting: only !== "social",
    social: only !== "meeting",
  };

  /*
    `?dry=1` reports what each reminder would post without posting it, and
    `?silent=1` posts without notifying anyone. production carries neither
    switch as a secret — deliberately, so a real 8am run pings properly — which
    left no way to exercise this against the real channels without pinging the
    editorial board. these are that way.

    a query parameter beats an environment variable for this: it applies to one
    request rather than standing until somebody remembers to remove it
  */
  const options: Env = {
    ...env,
    ...(query.get("dry") ? { REMINDERS_DRY_RUN: "1" } : {}),
    ...(query.get("silent") ? { REMINDERS_NO_PING: "1" } : {}),
  };

  const report = await runReminders(
    options,
    easternNow(new Date()),
    which,
    "manual",
  );

  return new Response(JSON.stringify(report, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
};

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { editorialBoardMember } from "~/lib/admin";
import { easternNow } from "~/lib/eastern";
import { ALL, runAutomations, type Which } from "~/lib/automations/run";
import { automation } from "~/lib/automations/registry";
import { refreshChoices } from "~/lib/articles/choices";
import { refreshFromNotion } from "~/lib/articles/refresh";
import { rebuild } from "~/lib/articles/sync";

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

  /*
    two ways in, one path out. the bearer secret is for a terminal; the session
    is for the admin panel's buttons, where a member holding @Editorial Board
    has already proved who they are
  */
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "");
  /* a bearer run legitimately has no actor; a panel run always does */
  const member =
    given && matches(given, expected)
      ? null
      : await editorialBoardMember(request);

  if (!(given && matches(given, expected)) && !member) {
    return new Response("unauthorized", { status: 401 });
  }

  const query = new URL(request.url).searchParams;

  /*
    `?sync=1` refreshes the article index, the picker options and the command
    surface, and fires no reminders.

    it exists because the sync otherwise only runs on the hourly tick, which
    means a change to it cannot be exercised without waiting up to an hour and
    then reading a log to find out. one meaning per request: this returns
    without touching the reminders rather than doing both
  */
  if (query.get("sync")) {
    const sync = await refreshFromNotion(env, { rebuild, refreshChoices });

    return Response.json(
      { sync },
      { status: sync.outcome === "failed" ? 500 : 200 },
    );
  }

  /*
    `?only=meeting` or `?only=social` to fire one; both by default. the reminders
    themselves decide there is nothing to say on a quiet day, so firing both is
    safe
  */
  const only = query.get("only");
  if (only && !automation(only)) {
    return new Response(`unknown automation: ${only}`, { status: 400 });
  }

  /* validated against the registry rather than a hardcoded pair, so a third
     automation is reachable here the moment it exists */
  const which: Which = only ? new Set([automation(only)!.id]) : ALL;

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

  /*
    the session, kept rather than discarded. every panel trigger used to write
    a row with no actor, which made the one action that pings the whole club the
    least attributable thing here — the opposite of what ADR 0007 promised
  */
  const report = await runAutomations(
    options,
    easternNow(new Date()),
    which,
    "manual",
    member?.discordUserId,
  );

  return new Response(JSON.stringify(report, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
};

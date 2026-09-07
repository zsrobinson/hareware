/*
  the hourly pass that turns approved discord applications into Members rows.

  there is no webhook and nothing fires when an editor presses approve. The cron
  that already carries the reminders reads the whole approved list, compares it
  against Members, and creates the rows that cannot possibly be anybody who is
  already there. See ADR 0010 on why the read is stateless rather than cursored.

  this automation posts nothing. It exists so that somebody who applied on
  monday autocompletes on the kiosk at wednesday's meeting without anyone having
  opened the reconciler in between — which is the thing that keeps the kiosk
  worth using.

  the decisions are not here. `match.ts` works out what each application
  resolves to and `write.ts` performs the create; what is left in this file is
  which secrets are needed, the order the writes go out in, and one line of
  english for the log.
*/

import type { EasternNow } from "~/lib/eastern";
import { misconfigured, ok, skipped, type Result } from "~/lib/result";
import { approvedApplications } from "~/lib/services/discord/join-requests";
import { resolveApplications, safeToCreate, type Resolution } from "./match";
import { people } from "./roster";
import { createFromApplication } from "./write";

/**
 * how long to wait between creates.
 *
 * notion's budget is about three requests a second and the first run creates
 * roughly thirty-eight rows, so the writes are serial with a gap rather than a
 * `Promise.all`. Thirty-eight rows at this pace is under fifteen seconds, which
 * is nothing against a cron tick — and a 429 partway through a backfill leaves
 * a half-created roster that the next hour would have to reason about, which is
 * far more expensive than the wait
 */
const BETWEEN_WRITES_MS = 350;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * creates a Members row for every application that matches nothing at all.
 *
 * only the `new` resolutions, and deliberately only those — every other
 * outcome is a collision, and a collision is where a wrong guess makes two
 * people out of one. The cron has nobody to ask, so it defers to the
 * reconciler and says how many it left there.
 */
export async function syncApplications(
  env: Env,
  /* every automation is `(env, time) => Result`, and this one happens not to
     care what time it is — the applications it acts on are the ones that are
     there, whatever hour the cron woke on */
  _eastern: EasternNow,
): Promise<Result> {
  /* inert until the club sets these up, the same way every other automation is
     — see ADR 0006's "setup outside the repo" */
  const missing = [
    !env.NOTION_TOKEN && "NOTION_TOKEN",
    !env.DISCORD_BOT_TOKEN && "DISCORD_BOT_TOKEN",
  ].filter(Boolean);
  /* not `ok`: nothing ran, and a row saying otherwise is the failure ADR 0007
     exists to prevent */
  if (missing.length > 0)
    return misconfigured(`application sync unset: ${missing.join(", ")}`);

  /*
    two different services holding nothing in common, and both answers are
    needed before anything can be decided — serialising them would add a round
    trip to a job that already has a write budget to spend
  */
  const [applications, roster] = await Promise.all([
    approvedApplications(env.DISCORD_BOT_TOKEN!),
    people(env.NOTION_TOKEN!),
  ]);

  const resolutions = resolveApplications(roster, applications);
  const creatable = safeToCreate(resolutions);
  const waiting = deferred(resolutions);

  if (creatable.length === 0)
    return skipped(
      `No new applications out of ${applications.length}. ${leftovers(waiting)}`,
    );

  /*
    a dry run must not write. it is how somebody sees what the morning would do
    before letting it — and `run.ts` deliberately records nothing for a dry run,
    so this line goes to whoever pressed the button rather than into the log
  */
  if (env.REMINDERS_DRY_RUN)
    return ok(
      `Would create ${plural(creatable.length, "member")} from applications. ${leftovers(waiting)}`,
    );

  /*
    serially. notion allows about three requests a second and rejects the rest
    with a 429, and a first run has roughly thirty-eight rows to make — a
    `Promise.all` over that is thirty-eight simultaneous writes and a partial
    roster. Plain awaits with a small gap keep it inside the budget, and the
    hourly cron will pick up anything a failure here leaves behind, because the
    read is stateless
  */
  let created = 0;
  for (const application of creatable) {
    if (created > 0) await pause(BETWEEN_WRITES_MS);
    await createFromApplication(env, application);
    created += 1;
  }

  return ok(
    `Created ${plural(created, "member")} from applications. ${leftovers(waiting)}`,
  );
}

/** the resolutions a person has to decide, grouped by why */
type Deferred = Record<"linkable" | "ambiguous" | "conflicted", number>;

/**
 * what the cron would not touch.
 *
 * `linked` is not in here. A row that already carries the snowflake is finished
 * business, not work waiting for somebody — counting it would put a permanent
 * and growing number in the log line that never goes down
 */
function deferred(resolutions: Resolution[]): Deferred {
  const counts: Deferred = { linkable: 0, ambiguous: 0, conflicted: 0 };

  for (const resolution of resolutions) {
    if (resolution.status in counts)
      counts[resolution.status as keyof Deferred] += 1;
  }

  return counts;
}

/**
 * the second sentence of the summary.
 *
 * the summary is one line in the invocation log and on the trigger panel, so it
 * is written as english rather than as a count dump: somebody reading it a
 * month later wants to know whether anything is waiting on them, and a bare
 * `{linkable: 2}` does not answer that
 */
function leftovers(waiting: Deferred): string {
  const total = waiting.linkable + waiting.ambiguous + waiting.conflicted;
  if (total === 0) return "Nothing is waiting on the reconciler.";

  const why = [
    waiting.linkable && `${waiting.linkable} to link`,
    waiting.ambiguous && `${waiting.ambiguous} ambiguous`,
    waiting.conflicted && `${waiting.conflicted} conflicted`,
  ].filter(Boolean);

  return `${total} need${total === 1 ? "s" : ""} review on the reconciler (${why.join(", ")}).`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

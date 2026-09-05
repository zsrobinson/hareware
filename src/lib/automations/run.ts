import { easternNow, type EasternNow } from "~/lib/eastern";
import { record } from "~/lib/log";
import { refreshCommands } from "~/lib/articles/refresh";
import { reportFailure } from "./alert";
import {
  AUTOMATIONS,
  type Automation,
  type AutomationId,
  failed,
  type Result,
} from "./registry";

/** which automations a caller wants. empty means all of them */
export type Which = Set<AutomationId>;

export const ALL: Which = new Set(AUTOMATIONS.map((a) => a.id));

/**
 * which schedule fires the reminders.
 *
 * this is load-bearing rather than cosmetic. the article index syncs every
 * minute, and the reminders are due when the *eastern hour* matches — so
 * without a check on which schedule woke us, every minute of 8am would be a
 * fresh 8am and the club would be pinged sixty times.
 */
export const REMINDER_CRON = "0 * * * *";

/**
 * the cron entry, for both schedules.
 *
 * hourly decides what is due by eastern hour rather than the schedule encoding
 * one, which is what keeps it from drifting across daylight saving — see
 * `~/lib/eastern`. the minute schedule only syncs.
 */
export async function runScheduled(controller: ScheduledController, env: Env) {
  const eastern = easternNow(new Date(controller.scheduledTime));

  /*
    each automation carries its own hour, so a second one at a different time
    is a registry entry rather than a branch here.

    `REMINDERS_IGNORE_HOUR` still ignores the hour, but never the schedule: it
    exists to see a reminder without waiting for 8am, and on the minute cron it
    would mean sixty of them
  */
  const hourly = controller.cron === REMINDER_CRON;
  const due = new Set(
    hourly
      ? AUTOMATIONS.filter(
          (a) => a.hour === eastern.hour || env.REMINDERS_IGNORE_HOUR,
        ).map((a) => a.id)
      : [],
  );

  if (due.size > 0) {
    try {
      await runAutomations(env, eastern, due, "cron");
    } catch (error) {
      /*
        this runs inside `ctx.waitUntil`, where a rejection is reported as an
        unhandled one rather than as any of the lines below — so anything that
        throws outside the settled results would vanish from the log it belongs
        in
      */
      console.error("[automations] failed before dispatch", error);
    }
  }

  /*
    after the reminders, and on every tick of either schedule.

    every minute because this is what makes the article index right, and how
    right it is is the whole feel of the thing: notion delivers webhooks
    at-most-once and out of order, so the rebuild is not a backstop for a rare
    failure — it is the only guarantee the picker ever matches notion, and an
    hour of that guarantee is long enough to read as broken. two notion
    requests a minute against a budget of three a second is nothing. see
    ADR 0009.

    *after* because it reads notion and writes d1 with no deadline of its own,
    and at 8am eastern it shares a tick with the reminders. a slow notion
    delaying the command surface costs a picker an hour of new options; the same delay in
    front of the reminders costs the club its morning ping
  */
  await refreshTheCommandSurface(env);
}

/**
 * runs the automations asked for and says what each of them did.
 *
 * shared by the cron and by the manual trigger, so one fired by hand takes
 * exactly the path it takes at 8am — there is no second implementation to drift
 */
export async function runAutomations(
  env: Env,
  eastern: EasternNow,
  which: Which,
  source: "cron" | "manual" = "manual",
  actor?: string,
): Promise<Record<string, string>> {
  const asked = AUTOMATIONS.filter((a) => which.has(a.id));

  /*
    all of them run even if one throws. they share nothing, and a Notion outage
    should not cost the social team their ping
  */
  const results = await Promise.allSettled(
    asked.map((a) => a.run(env, eastern)),
  );

  const report: Record<string, string> = {};
  for (const a of AUTOMATIONS) {
    if (!which.has(a.id)) report[a.action] = "not requested";
  }

  for (const [index, settled] of results.entries()) {
    /* the automation, not the array position — deriving the name from the
       index meant reordering two lines relabelled every row silently */
    const automation = asked[index]!;

    const result = read(settled);
    report[automation.action] = result.summary;

    if (result.outcome === "failed") {
      console.error(`[${automation.action}] ${result.summary}`);
    } else {
      console.log(`[${automation.action}] ${result.summary}`);
    }

    await recordRun(env, automation, result, source, actor);
  }

  return report;
}

/** a settled promise as an outcome, so a throw and a failure look the same */
function read(settled: PromiseSettledResult<Result>): Result {
  return settled.status === "fulfilled"
    ? settled.value
    : failed(`failed: ${settled.reason}`);
}

async function recordRun(
  env: Env,
  automation: Automation,
  result: Result,
  source: "cron" | "manual",
  actor?: string,
) {
  /*
    before the row is written, so it compares against the run before this one.
    only the cron reports: a run fired by hand returns its error to whoever
    pressed the button, and telling them twice is noise
  */
  if (result.outcome === "failed" && source === "cron") {
    await reportFailure(env, automation, result.summary);
  }

  /*
    a dry run posted nothing, so recording it `ok` would put a green row in the
    log for a message that never went out — the exact distinction this branch
    widened the outcomes to make. it also re-armed the alert gate, so a dry run
    on wednesday made thursday's real failure read as fresh
  */
  if (env.REMINDERS_DRY_RUN) return;

  await record(env.DB, {
    source,
    action: automation.action,
    outcome: result.outcome,
    summary: result.summary,
    actor,
  });
}

/**
 * the article index, the picker options, and the command surface.
 *
 * a row is written only when something went wrong. a healthy sync happens
 * twenty-four times a day, and logging each one would bury the two reminders
 * the log exists to make legible — while a silent failure here is exactly what
 * ADR 0007 says must never look like nothing happened
 */
async function refreshTheCommandSurface(env: Env) {
  try {
    const result = await refreshCommands(env);

    if (result.outcome === "ok" || result.outcome === "skipped") return;

    await record(env.DB, {
      source: "cron",
      action: "command-surface",
      outcome: result.outcome,
      summary: result.summary,
    });
  } catch (error) {
    /* this runs after the reminders and must never disturb them: a stale picker
       is a better morning than a stale picker and no meeting reminder */
    console.error("[articles] command surface refresh failed", error);

    await record(env.DB, {
      source: "cron",
      action: "command-surface",
      outcome: "failed",
      summary: `command surface refresh threw: ${String(error)}`,
    });
  }
}

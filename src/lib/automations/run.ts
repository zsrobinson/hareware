import { easternNow, type EasternNow } from "~/lib/eastern";
import { record } from "~/lib/log";
import { AUTOMATIONS, type Automation, type AutomationId } from "./registry";

/** which automations a caller wants. empty means all of them */
export type Which = Set<AutomationId>;

export const ALL: Which = new Set(AUTOMATIONS.map((a) => a.id));

/**
 * the cron entry. fires hourly and decides what is due, rather than the
 * schedule encoding an hour that would drift across daylight saving — see
 * `~/lib/eastern`
 */
export async function runScheduled(controller: ScheduledController, env: Env) {
  const eastern = easternNow(new Date(controller.scheduledTime));

  /*
    each automation carries its own hour, so a second one at a different time
    is a registry entry rather than a branch here
  */
  const due = new Set(
    AUTOMATIONS.filter(
      (a) => a.hour === eastern.hour || env.REMINDERS_IGNORE_HOUR,
    ).map((a) => a.id),
  );

  if (due.size === 0) return;

  try {
    await runAutomations(env, eastern, due, "cron");
  } catch (error) {
    /*
      this runs inside `ctx.waitUntil`, where a rejection is reported as an
      unhandled one rather than as any of the lines below — so anything that
      throws outside the settled results would vanish from the log it belongs in
    */
    console.error("[automations] failed before dispatch", error);
  }
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
function read(
  settled: PromiseSettledResult<{ outcome: string; summary: string }>,
) {
  return settled.status === "fulfilled"
    ? settled.value
    : { outcome: "failed" as const, summary: `failed: ${settled.reason}` };
}

async function recordRun(
  env: Env,
  automation: Automation,
  result: { outcome: string; summary: string },
  source: "cron" | "manual",
  actor?: string,
) {
  const { reportFailure } = await import("./alert");

  /*
    before the row is written, so it compares against the run before this one.
    only the cron reports: a run fired by hand returns its error to whoever
    pressed the button, and telling them twice is noise
  */
  if (result.outcome === "failed" && source === "cron") {
    await reportFailure(env, automation.action, result.summary);
  }

  await record(env.DB, {
    source,
    action: automation.action,
    outcome: result.outcome as "ok" | "failed" | "skipped" | "misconfigured",
    summary: result.summary,
    actor,
  });
}

import { easternNow } from "~/lib/eastern";
import { record } from "~/lib/log";
import { reportFailure } from "./alert";
import { failed, type Result } from "~/lib/result";
import { AUTOMATIONS, type Automation, type AutomationId } from "./registry";

export type Which = Set<AutomationId>;

export const ALL: Which = new Set(AUTOMATIONS.map((a) => a.id));

/**
 * Must match `triggers.crons` in wrangler.jsonc. The reminder is due by Eastern
 * hour, so another schedule ticking inside 8am would resend it.
 */
const REMINDER_CRON = "0 * * * *";

/**
 * the cron entry: due by Eastern hour, so DST cannot move it (`~/lib/eastern`)
 */
export async function runScheduled(controller: ScheduledController, env: Env) {
  const at = new Date(controller.scheduledTime);
  const eastern = easternNow(at);

  /* `REMINDERS_IGNORE_HOUR` ignores the hour, never the schedule */
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
      await runAutomations(env, at, due, "cron");
    } catch (error) {
      /* inside `waitUntil` a rejection would only surface as unhandled */
      console.error("[automations] failed before dispatch", error);
    }
  }
}

/**
 * runs the automations asked for, from the cron or by hand, and says what each
 * did
 */
export async function runAutomations(
  env: Env,
  at: Date,
  which: Which,
  source: "cron" | "manual" = "manual",
  actor?: string,
): Promise<Record<string, string>> {
  const asked = AUTOMATIONS.filter((a) => which.has(a.id));

  /* all run even if one throws */
  const results = await Promise.allSettled(asked.map((a) => a.run(env, at)));

  const report: Record<string, string> = {};
  for (const a of AUTOMATIONS) {
    if (!which.has(a.id)) report[a.action] = "not requested";
  }

  for (const [index, settled] of results.entries()) {
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

/** a throw becomes a failure */
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
  /* Before the row is written, so it compares with the previous run. A manual
     run already shows its error to whoever ran it. */
  if (result.outcome === "failed" && source === "cron") {
    await reportFailure(env, automation, result.summary);
  }

  /* a dry run posted nothing, and its row would also re-arm the alert gate */
  if (env.REMINDERS_DRY_RUN) return;

  await record(env.DB, {
    source,
    action: automation.action,
    outcome: result.outcome,
    summary: result.summary,
    actor,
  });
}

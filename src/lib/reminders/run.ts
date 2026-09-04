import { easternNow, type EasternNow } from "~/lib/eastern";
import { record } from "~/lib/log";
import { REMINDER_HOUR } from "./config";
import { sendMeetingReminder } from "./meeting";
import { sendSocialPing } from "./social";

export type Which = { meeting: boolean; social: boolean };

/**
 * the cron entry. fires hourly and decides whether anything is due, rather than
 * the schedule encoding an hour that would drift across daylight saving — see
 * `~/lib/eastern`
 */
export async function runScheduled(controller: ScheduledController, env: Env) {
  const eastern = easternNow(new Date(controller.scheduledTime));

  if (eastern.hour !== REMINDER_HOUR && !env.REMINDERS_IGNORE_HOUR) return;

  try {
    await runReminders(env, eastern, { meeting: true, social: true }, "cron");
  } catch (error) {
    /*
      this runs inside `ctx.waitUntil`, where a rejection is reported as an
      unhandled one rather than as any of the lines below — so anything that
      throws outside the settled pair would vanish from the log it belongs in
    */
    console.error("[reminders] failed before dispatch", error);
  }
}

/**
 * runs the reminders asked for and says what each of them did.
 *
 * shared by the cron and by the manual trigger, so a reminder fired by hand
 * takes exactly the path it takes at 8am — there is no second implementation to
 * drift
 */
export async function runReminders(
  env: Env,
  eastern: EasternNow,
  which: Which,
  source: "cron" | "manual" = "manual",
): Promise<Record<string, string>> {
  /*
    both run even if the other throws. they share nothing, and a notion outage
    should not cost the social team their ping
  */
  const results = await Promise.allSettled([
    which.meeting ? sendMeetingReminder(env, eastern) : "not requested",
    which.social ? sendSocialPing(env, eastern) : "not requested",
  ]);

  const report: Record<string, string> = {};

  for (const [index, result] of results.entries()) {
    const name = index === 0 ? "meeting-reminder" : "social-ping";

    const asked = index === 0 ? which.meeting : which.social;

    if (result.status === "fulfilled") {
      report[name] = result.value;
      console.log(`[${name}] ${result.value}`);
    } else {
      report[name] = `failed: ${result.reason}`;
      // surfaced in workers logs; #34 turns this into a discord alert
      console.error(`[${name}] failed`, result.reason);
    }

    // a reminder nobody asked for is not an invocation worth a row
    if (asked) {
      await record(env.DB, {
        source,
        action: name as "meeting-reminder" | "social-ping",
        outcome: result.status === "fulfilled" ? "ok" : "failed",
        summary: report[name]!,
      });
    }
  }

  return report;
}

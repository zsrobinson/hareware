import { easternNow } from "~/lib/eastern";
import { REMINDER_HOUR } from "./config";
import { sendMeetingReminder } from "./meeting";
import { sendSocialPing } from "./social";

/*
  the cron fires hourly and this decides whether anything is due, rather than
  the schedule encoding an hour that would drift across daylight saving. see
  `~/lib/eastern`
*/
export async function runScheduled(controller: ScheduledController, env: Env) {
  try {
    await runReminders(controller, env);
  } catch (error) {
    /*
      this runs inside `ctx.waitUntil`, where a rejection is reported as an
      unhandled one rather than as any of the lines below — so anything that
      throws outside the settled pair would vanish from the log it belongs in
    */
    console.error("[reminders] failed before dispatch", error);
  }
}

async function runReminders(controller: ScheduledController, env: Env) {
  const eastern = easternNow(new Date(controller.scheduledTime));
  if (eastern.hour !== REMINDER_HOUR) return;

  /*
    both reminders run even if the other throws. they share nothing, and a
    notion outage should not cost the social team their ping
  */
  const results = await Promise.allSettled([
    sendMeetingReminder(env, eastern),
    sendSocialPing(env, eastern),
  ]);

  for (const [index, result] of results.entries()) {
    const name = index === 0 ? "meeting-reminder" : "social-ping";

    if (result.status === "fulfilled") {
      console.log(`[${name}] ${result.value}`);
    } else {
      // surfaced in workers logs; #34 turns this into a discord alert
      console.error(`[${name}] failed`, result.reason);
    }
  }
}

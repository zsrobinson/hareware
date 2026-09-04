/*
  telling somebody when a scheduled run failed — issue #34.

  the bot runs unattended. when it works the evidence is a message in Discord;
  when it does not, there is nothing at all, and a quiet morning looks the same
  whether nothing was due or Notion was down. the invocation log made that
  findable. this is what makes it noticed.
*/

import { lastOutcome, type Row } from "~/lib/log";
import { postMessage, text } from "~/lib/discord/post-message";
import { ALERT_CHANNEL_ID, HAREWARE_ORIGIN } from "./config";

/** the friendly name for each action, for a line a person reads at 8am */
const NAMES: Record<string, string> = {
  "meeting-reminder": "The meeting reminder",
  "social-ping": "The social ping",
};

/**
 * posts a failure to the alert channel, once per run of bad luck.
 *
 * silent about a failure that was already reported: the previous recorded
 * outcome is the whole flood control, so a reminder broken for a week says so
 * on the first morning and then stops. it starts reporting again only after a
 * run that worked, which is also what "recovered" looks like from here.
 *
 * never throws. a reminder that posted correctly must not be reported as failed
 * because the alert could not be sent, and the alert is the less important of
 * the two
 */
export async function reportFailure(
  env: Env,
  action: Row["action"],
  summary: string,
) {
  try {
    /*
      read before the new row is written, so this is the outcome of the run
      before this one rather than of this one
    */
    if ((await lastOutcome(env.DB, action)) === "failed") return;

    const token = env.DISCORD_BOT_TOKEN;
    if (!token) return;

    await postMessage(
      token,
      ALERT_CHANNEL_ID,
      {
        blocks: [
          text(
            [
              `### ⚠️ ${NAMES[action] ?? action} did not run`,
              "",
              `\`\`\`\n${clip(summary)}\n\`\`\``,
              "",
              HAREWARE_ORIGIN
                ? `Nothing was posted. [The log](${HAREWARE_ORIGIN}/admin/log) has the rest, and the reminder will try again tomorrow.`
                : "Nothing was posted. The reminder will try again tomorrow.",
            ].join("\n"),
          ),
        ],
        /*
          no role mention. a transient Notion wobble at 8am is not worth waking
          anyone, and the point is that it is written down where somebody looks
          when a morning was quiet — not that it interrupts them
        */
      },
      {
        // a dry run has a human reading the response; it needs no announcement
        dryRun: Boolean(env.REMINDERS_DRY_RUN),
        silent: Boolean(env.REMINDERS_NO_PING),
        testChannelId: env.REMINDERS_TEST_CHANNEL,
      },
    );
  } catch (error) {
    console.error("[alert] could not report a failure", error);
  }
}

/** discord takes 4000 characters in a text display; a stack trace can beat it */
function clip(summary: string, limit = 1200) {
  return summary.length > limit ? `${summary.slice(0, limit)}…` : summary;
}

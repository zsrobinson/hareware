/* Posts when a scheduled run fails, so a broken morning does not look quiet. */

import { lastOutcome } from "~/lib/log";
import type { Automation } from "./registry";
import { postMessage, text } from "~/lib/services/discord/post-message";
import { ALERT_CHANNEL_ID, HAREWARE_ORIGIN } from "./config";

/**
 * Posts a failure once per streak: silent while the previous run also failed.
 * Never throws, so a failed alert cannot fail the run it reports.
 */
export async function reportFailure(
  env: Env,
  automation: Automation,
  summary: string,
) {
  try {
    /* read before this run's row is written */
    if ((await lastOutcome(env.DB, automation.action, "cron")) === "failed")
      return;

    const token = env.DISCORD_BOT_TOKEN;
    if (!token) return;

    await postMessage(
      token,
      ALERT_CHANNEL_ID,
      {
        blocks: [
          text(
            [
              `### ⚠️ ${automation.name} did not run`,
              "",
              `\`\`\`\n${clip(summary)}\n\`\`\``,
              "",
              HAREWARE_ORIGIN
                ? `Nothing was posted. [The log](${HAREWARE_ORIGIN}/log) has the rest, and the reminder will try again tomorrow.`
                : "Nothing was posted. The reminder will try again tomorrow.",
            ].join("\n"),
          ),
        ],
        /* no role mention: this is for whoever looks, not to wake anyone */
      },
      {
        dryRun: Boolean(env.REMINDERS_DRY_RUN),
        silent: Boolean(env.REMINDERS_NO_PING),
        testChannelId: env.REMINDERS_TEST_CHANNEL,
      },
    );
  } catch (error) {
    console.error("[alert] could not report a failure", error);
  }
}

/** under Discord's 4000 characters, which a stack trace can exceed */
function clip(summary: string, limit = 1200) {
  return summary.length > limit ? `${summary.slice(0, limit)}…` : summary;
}

/*
  What the Social Reminder page draws: the log and the next run's plan, in
  words, for /api/reminder.json once the gate has admitted the viewer.
*/

import { env } from "cloudflare:workers";
import { REMINDER_HOUR, SOCIAL_CHANNEL_ID } from "~/lib/automations/config";
import { channelLabel } from "~/lib/automations/registry";
import { easternLabel, planSocialPing } from "~/lib/automations/social";
import { easternInstant, easternNow } from "~/lib/eastern";
import { faces } from "~/lib/faces";
import { recent, type Row } from "~/lib/log";
import { ROLE_NAMES } from "~/lib/services/discord/config";

/** what the Social Reminder page draws, already in words */
export type ReminderView = {
  /** "#instagram-posting at 8:00 AM" */
  schedule: string;
  rows: Row[];
  /** discord ids to display names, for the log's "By" column */
  names: Record<string, string>;
  logError?: string;
  next: {
    at: string;
    pings?: string;
    /** set when the reminder could not be planned */
    problem?: string;
    since?: string;
    articles: { title: string; link: string; at: string }[];
  };
};

export async function reminderView(): Promise<ReminderView> {
  /* the next 8am, and what it would announce if nothing else published first */
  const now = new Date();
  const today = easternNow(now);
  const todayRun = easternInstant(today.date, REMINDER_HOUR);
  const nextRun =
    todayRun > now
      ? todayRun
      : easternInstant(
          easternNow(new Date(now.getTime() + 24 * 3600_000)).date,
          REMINDER_HOUR,
        );

  /* a log that cannot be read must not take the page down with it */
  const log = (async () => {
    try {
      const rows = env.DB
        ? (await recent(env.DB, 300)).filter(
            (row) =>
              row.action === "social-ping" || row.action === "mark-posted",
          )
        : [];
      return { rows };
    } catch (error) {
      console.error("[reminder] could not read the log", error);
      return {
        rows: [] as Row[],
        logError: "The history couldn't be read just now.",
      };
    }
  })();

  const [plan, { rows, logError }] = await Promise.all([
    planSocialPing(nextRun),
    log,
  ]);
  const profiles = await faces(rows.map((row) => row.actor));

  const view: ReminderView = {
    schedule: `${channelLabel(SOCIAL_CHANNEL_ID)} at ${REMINDER_HOUR % 12 || 12}:00 ${REMINDER_HOUR < 12 ? "AM" : "PM"}`,
    rows,
    names: Object.fromEntries(
      Object.entries(profiles).map(([id, profile]) => [
        id,
        profile.displayName,
      ]),
    ),
    logError,
    next:
      plan.status === "ready"
        ? {
            at: easternLabel(nextRun),
            pings: `@${ROLE_NAMES[plan.roleId] ?? plan.weekday}`,
            since: easternLabel(plan.since),
            articles: plan.articles.map((article) => ({
              title: article.title,
              link: article.link,
              at: easternLabel(article.publishedAt),
            })),
          }
        : { at: easternLabel(nextRun), problem: plan.summary, articles: [] },
  };

  return view;
}

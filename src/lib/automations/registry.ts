/* Every automation. This list both describes and dispatches them. */

import type { EasternNow } from "~/lib/eastern";
import type { Result } from "~/lib/result";
import type { Row } from "~/lib/log";
import { REMINDER_HOUR, BOARD_CHANNEL_ID, SOCIAL_CHANNEL_ID } from "./config";
import { sendMeetingReminder } from "./meeting";
import { sendSocialPing } from "./social";
import { syncApplications } from "~/lib/members/sync";

export type AutomationId = "meeting" | "social" | "applications";

export type Automation = {
  id: AutomationId;
  /** what the log calls it. Stable: written rows use it */
  action: Row["action"];
  name: string;
  description: string;
  /** where it posts; absent when it posts nothing */
  channelId?: string;
  /** the Eastern hour it runs, or every tick (ADR 0010) */
  hour: number | "hourly";
  run: (env: Env, eastern: EasternNow) => Promise<Result>;
};

export const AUTOMATIONS: Automation[] = [
  {
    id: "meeting",
    action: "meeting-reminder",
    name: "Board meeting",
    description:
      "Posts the agenda when the Meetings database holds an editorial board meeting dated today.",
    channelId: BOARD_CHANNEL_ID,
    hour: REMINDER_HOUR,
    run: sendMeetingReminder,
  },
  {
    id: "social",
    action: "social-ping",
    name: "Social duty",
    description:
      "Posts what published today and pings the day's poster role. Reads WordPress, not the tracker.",
    channelId: SOCIAL_CHANNEL_ID,
    hour: REMINDER_HOUR,
    run: sendSocialPing,
  },
  {
    id: "applications",
    action: "application-sync",
    name: "Member applications",
    description:
      "Creates a Members row for each approved Discord application that matches nobody already on the roster. Posts nothing; anything ambiguous is left for the reconciler.",
    hour: "hourly",
    run: syncApplications,
  },
];

/** an automation by id */
export function automation(id: string): Automation | undefined {
  return AUTOMATIONS.find((a) => a.id === id);
}

/** "8am" */
export function hourLabel(hour: number | "hourly") {
  if (hour === "hourly") return "every hour";

  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

/** "#editorial-board", or "posts nothing" */
export function channelLabel(channelId: string | undefined) {
  if (!channelId) return "posts nothing";
  return CHANNEL_NAMES[channelId] ?? `channel ${channelId}`;
}

const CHANNEL_NAMES: Record<string, string> = {
  [BOARD_CHANNEL_ID]: "#editorial-board",
  [SOCIAL_CHANNEL_ID]: "#instagram-posting",
};

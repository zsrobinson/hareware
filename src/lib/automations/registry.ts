/* Every automation. This list both describes and dispatches them. */

import type { Result } from "~/lib/result";
import type { Row } from "~/lib/log";
import { REMINDER_HOUR, SOCIAL_CHANNEL_ID } from "./config";
import { sendSocialPing } from "./social";

export type AutomationId = "social";

export type Automation = {
  id: AutomationId;
  /** what the log calls it. Stable: written rows use it */
  action: Row["action"];
  name: string;
  description: string;
  /** where it posts */
  channelId: string;
  /** the Eastern hour it runs */
  hour: number;
  run: (env: Env, now: Date) => Promise<Result>;
};

export const AUTOMATIONS: Automation[] = [
  {
    id: "social",
    action: "social-ping",
    name: "Social reminder",
    description:
      "Announces every article published since the previous morning's run and pings that day's poster role.",
    channelId: SOCIAL_CHANNEL_ID,
    hour: REMINDER_HOUR,
    run: sendSocialPing,
  },
];

/** an automation by id */
export function automation(id: string): Automation | undefined {
  return AUTOMATIONS.find((a) => a.id === id);
}

/** "8am" */
export function hourLabel(hour: number) {
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

/** "#instagram-posting" */
export function channelLabel(channelId: string) {
  return CHANNEL_NAMES[channelId] ?? `channel ${channelId}`;
}

const CHANNEL_NAMES: Record<string, string> = {
  [SOCIAL_CHANNEL_ID]: "#instagram-posting",
};

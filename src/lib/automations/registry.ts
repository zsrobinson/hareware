/*
  every automation, in one list that both describes and dispatches them.

  this used to be description only — the admin panel read it while `run.ts`
  kept a hand-written array of the same two things in the same order, deriving
  each one's name from its *array position*. Adding a third meant editing six
  places coupled by nothing but convention, and swapping two lines silently
  relabelled every log row.

  Now the function is the entry. Adding an automation is one entry here plus
  one module, which is what this file already claimed.

  The shape is deliberately the one a watcher or a command also fits: something
  with an id, a schedule, and a function from (env, time) to a result. When a
  Notion or Discord watcher arrives, it belongs here with a different `trigger`
  rather than in a parallel system.
*/

import type { EasternNow } from "~/lib/eastern";
import type { Result } from "~/lib/result";
import type { Row } from "~/lib/log";
import { REMINDER_HOUR, BOARD_CHANNEL_ID, SOCIAL_CHANNEL_ID } from "./config";
import { sendMeetingReminder } from "./meeting";
import { sendSocialPing } from "./social";

export type AutomationId = "meeting" | "social";

/**
 * what an automation reports back.
 *
 * `ok` is reserved for "it did the thing". A run that found nothing to do is
 * `skipped` and a run that could not try is `misconfigured` — both used to be
 * recorded as `ok`, so a week of WordPress refusing the feed produced seven
 * green rows in the log ADR 0007 exists to prevent.
 */
/*
  re-exported rather than moved-and-repointed everywhere: `Result` is the
  vocabulary every automation already speaks, and its definition belongs in
  `~/lib/result` because six modules that are not automations — two of them
  under `services/`, whose rule is that it knows nothing about this layer —
  also speak it
*/
export type { Outcome, Result } from "~/lib/result";
export { ok, skipped, misconfigured, failed } from "~/lib/result";

export type Automation = {
  id: AutomationId;
  /** what the log calls it. stable: rows already written use these */
  action: Row["action"];
  name: string;
  /** what it does, in the words a club member would use */
  description: string;
  /** where it posts, as an id — so the panel and the message cannot disagree */
  channelId: string;
  /** the hour it runs, eastern */
  hour: number;
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
];

/** an automation by id, for a route validating `?only=` against what exists */
export function automation(id: string): Automation | undefined {
  return AUTOMATIONS.find((a) => a.id === id);
}

/** "8am", the way the panel says it */
export function hourLabel(hour: number) {
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

/** "#editorial-board", for a confirmation nobody should click through blind */
export function channelLabel(channelId: string) {
  return CHANNEL_NAMES[channelId] ?? `channel ${channelId}`;
}

const CHANNEL_NAMES: Record<string, string> = {
  [BOARD_CHANNEL_ID]: "#editorial-board",
  [SOCIAL_CHANNEL_ID]: "#instagram-posting",
};

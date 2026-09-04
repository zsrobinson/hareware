import { REMINDER_HOUR } from "./config";

/*
  what reminders exist, described rather than implied.

  the admin panel reads this, so adding one means adding an entry here rather
  than editing a page. it is deliberately data and not behaviour — the sending
  still lives in its own module — which is the seam a UI-editable reminder
  would widen. see the note in docs/adr/0007
*/

export type ReminderId = "meeting" | "social";

export type ReminderDefinition = {
  id: ReminderId;
  name: string;
  /** what it does, in the words a club member would use */
  description: string;
  /** where it posts, for the confirmation nobody should click through blind */
  channel: string;
  /** the hour it runs, eastern */
  hour: number;
};

export const REMINDERS: ReminderDefinition[] = [
  {
    id: "meeting",
    name: "Board meeting",
    description:
      "Posts the agenda when the Meetings database holds an editorial board meeting dated today.",
    channel: "#editorial-board",
    hour: REMINDER_HOUR,
  },
  {
    id: "social",
    name: "Social duty",
    description:
      "Posts what published today and pings the day's poster role. Reads WordPress, not the tracker.",
    channel: "#instagram-posting",
    hour: REMINDER_HOUR,
  },
];

/** "8am", the way the panel says it */
export function hourLabel(hour: number) {
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

/*
  cloudflare runs crons in utc and has no timezone setting, so every reminder
  that means "8am eastern" has to work it out itself. america/new_york shifts
  twice a year; hardcoding an offset would silently drift by an hour for half of
  each year, which for the social ping means the post lands before anyone has
  had coffee, or after the day is half gone.

  the cron fires hourly and each reminder asks these helpers whether this is its
  hour, rather than the schedule encoding the answer
*/

const ZONE = "America/New_York";

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  weekday: "long",
  hour12: false,
});

export type EasternNow = {
  /** `YYYY-MM-DD` in eastern time, for comparing against a notion date */
  date: string;
  /** 0-23, eastern */
  hour: number;
  /** "Monday", "Tuesday", … — the key into the duty roster */
  weekday: string;
};

export function easternNow(now: Date): EasternNow {
  const found: Record<string, string> = {};
  for (const part of parts.formatToParts(now)) found[part.type] = part.value;

  return {
    date: `${found.year}-${found.month}-${found.day}`,
    // en-US hour12:false yields "24" rather than "00" at midnight
    hour: Number(found.hour) % 24,
    weekday: found.weekday!,
  };
}

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * an instant as a short eastern clock time — "8pm", "7:30pm".
 *
 * notion hands back a date with no time as a bare `YYYY-MM-DD`, which is a
 * calendar day and not an instant, so there is nothing to show for one of
 * those. callers get undefined and leave the time out of the sentence
 */
export function easternTime(start: string): string | undefined {
  if (!start.includes("T")) return undefined;

  const found: Record<string, string> = {};
  for (const part of clock.formatToParts(new Date(start)))
    found[part.type] = part.value;

  const minutes = found.minute === "00" ? "" : `:${found.minute}`;
  return `${found.hour}${minutes}${found.dayPeriod?.toLowerCase()}`;
}

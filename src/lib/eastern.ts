/*
  Eastern time from a UTC instant. Crons are UTC and a fixed offset would be an
  hour off for half the year.
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
  /** `YYYY-MM-DD` in eastern time */
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

/** the day before a `YYYY-MM-DD` */
export function dayBefore(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * The instant an Eastern date reaches an hour. Not for 1am or 2am, which DST
 * can repeat or skip; the reminder hour is neither.
 */
export function easternInstant(date: string, hour: number): Date {
  /* Eastern is UTC-4 or UTC-5; only one of the two lands on that hour */
  for (const offset of [4, 5]) {
    const guess = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
    guess.setUTCHours(guess.getUTCHours() + offset);
    const back = easternNow(guess);
    if (back.date === date && back.hour === hour) return guess;
  }
  throw new Error(`${date} has no ${hour}:00 in Eastern time`);
}

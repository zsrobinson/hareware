/* One way to write each kind of date, everywhere in the archive pages. */

const ZONE = "America/New_York";

/** "Nov 6, 2026", from an instant or a `YYYY-MM-DD` */
export function formatDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  return date.toLocaleDateString("en-US", {
    timeZone: ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Nov 2026", for a span like first and latest credit */
export function formatMonth(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString(
    "en-US",
    {
      timeZone: ZONE,
      month: "short",
      year: "numeric",
    },
  );
}

/** "Nov 6, 2026, 8:00 AM" */
export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-US", {
    timeZone: ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

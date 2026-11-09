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

/** "Fall 2022" → "F22", "Nov 2022" → "Nov ’22": a period's label where every one must fit */
export function shortLabel(label: string) {
  const term = /^(Spring|Fall) (\d{4})$/.exec(label);
  if (term) return `${term[1] === "Spring" ? "Sp" : "F"}${term[2]!.slice(2)}`;
  const month = /^(\w{3}) (\d{4})$/.exec(label);
  if (month) return `${month[1]} ’${month[2]!.slice(2)}`;
  const school = /^\d{2}(\d{2})–(\d{2})$/.exec(label);
  if (school) return `${school[1]}–${school[2]}`;
  return label;
}

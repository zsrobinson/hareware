import type { QueryKey } from "@tanstack/react-query";

export type ProfileLocation = {
  member?: string;
  from?: string;
  to?: string;
};

export type ProfileRangeChoice =
  "all" | "semester" | "academic" | "year" | "custom";

export function parseProfileLocation(search: URLSearchParams): {
  valid: boolean;
  location: ProfileLocation;
} {
  const member = search.get("member") || undefined;
  const from = search.get("from") || undefined;
  const to = search.get("to") || undefined;
  const valid =
    validDate(from) && validDate(to) && (!from || !to || from <= to);
  return {
    valid,
    location: { ...(member ? { member } : {}), ...(valid ? { from, to } : {}) },
  };
}

export const profileKey = ({
  member = "",
  from = "",
  to = "",
}: ProfileLocation) =>
  ["members", "profile", member, from, to] as const satisfies QueryKey;

function path(base: string, location: ProfileLocation): string {
  const query = new URLSearchParams();
  if (location.member) query.set("member", location.member);
  if (location.from) query.set("from", location.from);
  if (location.to) query.set("to", location.to);
  const suffix = query.toString();
  return `${base}${suffix ? `?${suffix}` : ""}`;
}

export const profilePath = (location: ProfileLocation) =>
  path("/api/profile", location);
export const profilePagePath = (location: ProfileLocation) =>
  path("/profile", location);

export function profilePresets(today: string) {
  const [year, month] = today.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const semester =
    month <= 6
      ? { from: `${year}-01-01`, to: `${year}-06-30` }
      : { from: `${year}-07-01`, to: `${year}-12-31` };
  const academic =
    month >= 7
      ? { from: `${year}-07-01`, to: `${year + 1}-06-30` }
      : { from: `${year - 1}-07-01`, to: `${year}-06-30` };
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  date.setUTCDate(date.getUTCDate() + 1);
  return {
    semester,
    academic,
    year: { from: date.toISOString().slice(0, 10), to: today },
  };
}

export function selectedProfileRange(
  location: ProfileLocation,
  presets: ReturnType<typeof profilePresets>,
): ProfileRangeChoice {
  if (!location.from && !location.to) return "all";
  return (
    (Object.entries(presets).find(
      ([, range]) => range.from === location.from && range.to === location.to,
    )?.[0] as Exclude<ProfileRangeChoice, "all" | "custom"> | undefined) ??
    "custom"
  );
}

function validDate(value?: string): boolean {
  if (!value) return true;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

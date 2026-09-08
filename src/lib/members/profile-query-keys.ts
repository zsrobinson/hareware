import type { QueryKey } from "@tanstack/react-query";

export type ProfileLocation = {
  member?: string;
  from?: string;
  to?: string;
};

export const profileKey = ({
  member = "",
  from = "",
  to = "",
}: ProfileLocation) =>
  ["members", "profile", member, from, to] as const satisfies QueryKey;

export function profilePath(location: ProfileLocation): string {
  const query = new URLSearchParams();
  if (location.member) query.set("member", location.member);
  if (location.from) query.set("from", location.from);
  if (location.to) query.set("to", location.to);
  const suffix = query.toString();
  return `/api/profile${suffix ? `?${suffix}` : ""}`;
}

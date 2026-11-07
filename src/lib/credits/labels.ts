/*
  Which paragraph labels are credit lines, and what kind of credit each one
  is. These are the defaults; the Sheet's Labels tab replaces them once it has
  any rows (see ./sheet).
*/

export const ROLES = ["writer", "image", "other"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_NAMES: Record<Role, string> = {
  writer: "Writing",
  image: "Images",
  other: "Other",
};

export type Label = { label: string; role: Role };

/* every label the archive used up to 2026-11, so a Sheet that has none still
   reads every post */
export const DEFAULT_LABELS: Label[] = [
  { label: "Article by", role: "writer" },
  { label: "By", role: "writer" },
  { label: "Puzzle by", role: "writer" },
  { label: "Activity by", role: "writer" },
  { label: "Credits", role: "writer" },
  { label: "Image Credits", role: "image" },
  { label: "Image Credit", role: "image" },
  { label: "Thumbnail Credits", role: "image" },
  { label: "Formatted by", role: "other" },
];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

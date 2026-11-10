/*
  Series colors: blue, orange, aqua, violet, magenta, validated as a set for
  both modes in this order. Violet replaces the reference palette's yellow,
  which read as a second orange beside Features. Light mode's aqua and magenta
  sit under 3:1, so every chart carries its table. A color follows its entity, never its
  rank: a section keeps its hue however the filters cut the list, and series
  stack in slot order (the paper's section order, which ~/lib/credits/stats
  sorts them into) so neighbours are the pairs the palette was checked for.
  Roles take three steps of one quiet slate of their own (Writing darkest,
  Other faintest, each at least 3:1 from the next in both modes, and Other
  edged in Image's tone, being near the page), so a role is never read as a
  section.
*/

import { ROLES } from "~/lib/credits/labels";
import { SECTION_ORDER } from "~/lib/credits/sections";

const SLOTS = 5;

/** a chart with one series, which names no entity by its colour */
export const NEUTRAL = "var(--series-neutral)";

/** `var(--series-n)` for a series key, or the neutral for anything past the slots */
export function seriesColor(
  key: string,
  allKeys: string[],
  dimension: string,
): string {
  if (dimension === "role") {
    const index = (ROLES as readonly string[]).indexOf(key);
    return index === -1 ? "var(--series-other)" : `var(--role-${index + 1})`;
  }
  if (dimension === "section") {
    const index = (SECTION_ORDER as readonly string[]).indexOf(key);
    return index === -1 ? "var(--series-other)" : `var(--series-${index + 1})`;
  }
  /* the newest intakes are the ones a chart of them is about */
  const order = [...allKeys].sort();
  if (dimension === "joined") order.reverse();
  const index = order.indexOf(key);
  return index >= 0 && index < SLOTS
    ? `var(--series-${index + 1})`
    : "var(--series-other)";
}

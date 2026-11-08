/*
  Series colors: blue, orange, aqua, violet, magenta, validated as a set for
  both modes in this order. Violet replaces the reference palette's yellow,
  which read as a second orange beside Features. Light mode's aqua and magenta
  sit under 3:1, so every chart carries its table. A color follows its entity, never its
  rank: a section keeps its hue however the filters cut the list, and series
  stack in slot order (the paper's section order, which ~/lib/credits/stats
  sorts them into) so neighbours are the pairs the palette was checked for.
*/

import { ROLES } from "~/lib/credits/labels";
import { SECTION_ORDER } from "~/lib/credits/sections";

export const SLOTS = 5;

const orderFor = (dimension: string): readonly string[] =>
  dimension === "section" ? SECTION_ORDER : dimension === "role" ? ROLES : [];

/** `var(--series-n)` for a series key, or the neutral for anything past the slots */
export function seriesColor(
  key: string,
  allKeys: string[],
  dimension: string,
): string {
  const fixed = orderFor(dimension);
  if (fixed.length > 0) {
    const index = fixed.indexOf(key);
    return index === -1 ? "var(--series-other)" : `var(--series-${index + 1})`;
  }
  const index = [...allKeys].sort().indexOf(key);
  return index >= 0 && index < SLOTS
    ? `var(--series-${index + 1})`
    : "var(--series-other)";
}

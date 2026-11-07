/*
  Series colors: blue, orange, aqua, violet, magenta, validated as a set for
  both modes in this order. Violet replaces the reference palette's yellow,
  which read as a second orange beside Features. Light mode's aqua and magenta
  sit under 3:1, so every chart carries its table. A color follows its entity, never its
  rank: a section keeps its hue however the filters cut the list, and series
  stack in slot order so neighbours are the pairs the palette was checked for.
*/

export const SLOTS = 5;

/** sections in slot order, biggest desk first, so News sits on the baseline */
const SECTION_ORDER = [
  "News",
  "Features",
  "Sports",
  "Entertainment",
  "Rabbithole",
];
const ROLE_ORDER = ["writer", "image", "other"];

const orderFor = (dimension: string) =>
  dimension === "section"
    ? SECTION_ORDER
    : dimension === "role"
      ? ROLE_ORDER
      : [];

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

/** series in the order they stack and list: slot order, anything unknown last */
export function seriesOrder<T extends { key: string }>(
  series: T[],
  dimension: string,
): T[] {
  const fixed = orderFor(dimension);
  if (fixed.length === 0) return series;
  const rank = (key: string) =>
    fixed.includes(key) ? fixed.indexOf(key) : fixed.length;
  return [...series].sort((a, b) => rank(a.key) - rank(b.key));
}

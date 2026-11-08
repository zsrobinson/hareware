/** the paper's own order, which every list, legend, stack and colour slot follows */
export const SECTION_ORDER = [
  "News",
  "Features",
  "Entertainment",
  "Sports",
  "Rabbithole",
] as const;

const rank = (section: string) => {
  const index = (SECTION_ORDER as readonly string[]).indexOf(section);
  return index === -1 ? SECTION_ORDER.length : index;
};

/** the known sections in the paper's order, then anything else alphabetically */
export function compareSections(a: string, b: string): number {
  return rank(a) - rank(b) || a.localeCompare(b);
}

export function sortSections(sections: Iterable<string>): string[] {
  return [...sections].sort(compareSections);
}

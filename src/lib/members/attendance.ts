/*
  merging one device's attendee list with notion's. Replacing the list would
  let a second device (a refresh, a second tab, a phone) silently erase the
  first's sign-ins, so the device sends what it knew as well as what it wants.
*/

/**
 * `current` with this device's intent applied: additions are `wanted` minus
 * `known`, removals `known` minus `wanted`, and nothing else in `current` is
 * touched. Order is `current`'s, then additions
 */
export function mergeAttendance(
  current: string[],
  known: string[],
  wanted: string[],
): string[] {
  const knew = new Set(known);
  const wants = new Set(wanted);

  const added = wanted.filter((id) => !knew.has(id));
  const removed = known.filter((id) => !wants.has(id));

  const merged = new Set([...current, ...added]);
  for (const id of removed) merged.delete(id);

  return [...merged];
}

/** one tap, held as a change rather than a list so a tap during another's write survives */
export type Intent = { kind: "add" | "remove"; pageId: string };

/** the list with one intent applied, in insertion order, idempotently */
export function applyIntent(list: string[], intent: Intent): string[] {
  if (intent.kind === "remove") {
    return list.filter((id) => id !== intent.pageId);
  }

  return list.includes(intent.pageId) ? list : [...list, intent.pageId];
}

/** notion's list with the unfinished taps applied; idempotent, so a write in flight draws the same */
export function applyIntents(list: string[], intents: Intent[]): string[] {
  return intents.reduce(applyIntent, list);
}

/**
 * `current` in the order the screen already had, new arrivals last. Notion
 * does not keep a relation's order, and the list jumped on every answer
 */
export function stableOrder(previous: string[], current: string[]): string[] {
  const now = new Set(current);
  const kept = previous.filter((id) => now.has(id));
  const drawn = new Set(kept);

  return [...kept, ...current.filter((id) => !drawn.has(id))];
}

/*
  merging one device's idea of who is in the room with Notion's.

  the kiosk sends the whole attendee list, because removing somebody signed in
  by mistake is an edit an append cannot express. Sending the whole list is also
  how a second device erases the first: two laptops each holding [Ana, Ben] add
  one person apiece, both write their own three names, and whoever writes second
  deletes the other's. Nothing errors. The loss turns up months later as
  somebody one meeting short of a vote.

  ADR 0010 puts one laptop at the front of the room, which is still the plan.
  This exists because a second writer arrives without anybody deciding it
  should: a refresh, a second tab, an officer opening the page on a phone to
  check. So the write is a three-way merge rather than a replacement, and the
  device says what it *knew* as well as what it wants.
*/

/**
 * what the attendee list should become.
 *
 * `current` is Notion's list, read immediately before the write. `known` is
 * what the device had when the person tapped, and `wanted` is what it wants.
 * The difference between those two is the intent: anything in `wanted` that
 * was not in `known` is an addition, anything in `known` that is not in
 * `wanted` is a removal, and everything else in `current` is somebody else's
 * work that this device never knew about and must not delete.
 *
 * order is preserved from `current` first, then additions, so a list does not
 * reshuffle under whoever is reading it.
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

/**
 * the safe reading of a device that did not say what it knew.
 *
 * an empty `known`, not `wanted`. Empty means every name it sent is an
 * addition and none is a removal, which is union-only: an older page, or a
 * caller that forgets the field, can add somebody and can never delete one.
 *
 * `wanted` looks like the natural default and is the wrong one. It makes the
 * additions and the removals both empty, so the write becomes a no-op and a
 * person who tapped their name is silently not recorded. A test pins this
 */
export function knownOrSafe(known: string[] | undefined): string[] {
  return known ?? [];
}

/**
 * one tap, before it has been anywhere.
 *
 * a tap is an intent and not a list. holding it that way is what makes a
 * second tap during the first one's write safe: two people who tap a second
 * apart each hand over what *they* changed, and each is applied to whatever
 * the list is by the time it runs. Two whole lists computed a second apart
 * from the same starting point lose one of the two people
 */
export type Intent = { kind: "add" | "remove"; pageId: string };

/** the list with one intent applied, in insertion order, idempotently */
export function applyIntent(list: string[], intent: Intent): string[] {
  if (intent.kind === "remove") {
    return list.filter((id) => id !== intent.pageId);
  }

  return list.includes(intent.pageId) ? list : [...list, intent.pageId];
}

/**
 * the list with every intent applied in order.
 *
 * how the screen is drawn: notion's answer, then everything tapped since that
 * has not finished writing. Applying an intent twice is the same as applying
 * it once, so a write that is halfway through — already in the answer and
 * still in the queue — draws the same either way
 */
export function applyIntents(list: string[], intents: Intent[]): string[] {
  return intents.reduce(applyIntent, list);
}

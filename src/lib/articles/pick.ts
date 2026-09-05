/*
  turning index rows into the dropdown discord shows while an editor types.

  pure functions over rows, because everything that can go wrong here goes
  wrong silently: discord refuses the *entire* autocomplete response when one
  choice name is empty or over its limit, and refusing looks exactly like a
  slow index — an empty dropdown with no explanation. so the rules about
  length, emptiness and the 25 cap live in one place with tests on them, and
  the caller does the D1 read and nothing else. see ADR 0009.
*/

import type { ArticleRow } from "~/lib/db/schema";

/** discord rejects the whole response over this, per choice name */
export const MAX_CHOICE_NAME = 100;

/** and it will not show a 26th choice */
export const MAX_CHOICES = 25;

/**
 * how little of a headline is still worth showing.
 *
 * below this the byline is dropped to buy room, because two characters and an
 * ellipsis identifies nothing while a name often does
 */
const MIN_HEADLINE = 12;

/**
 * the one notion value written down here, and it decides an *ordering* only.
 *
 * ADR 0009 keeps notion values out of this repo because a casing slip becomes
 * a wrong write. nothing here writes: renaming the status in notion costs a
 * ranking hint, never correctness, and published articles still appear either
 * way
 */
const PUBLISHED = "Published";

/** what an untitled row is called; the index says the same, and may be wrong */
const UNTITLED = "Untitled";

export type AutocompleteChoice = { name: string; value: string };

/**
 * the choices for a set of index rows, ranked and capped.
 *
 * the value is the notion page id rather than the headline: a headline changes
 * throughout copy edit, so the label an editor scanned and the article they
 * picked have to be identified by different things.
 */
export function choicesFor(rows: ArticleRow[]): AutocompleteChoice[] {
  return [...rows]
    .sort(rank)
    .slice(0, MAX_CHOICES)
    .map((row) => ({ name: nameFor(row), value: row.pageId }));
}

/**
 * unfinished work first, then most recently edited.
 *
 * a published article is still offered — looking one up to check its date is a
 * real use — it is just never what an editor is most likely to be reaching for
 */
function rank(a: ArticleRow, b: ArticleRow): number {
  const done = Number(a.status === PUBLISHED) - Number(b.status === PUBLISHED);
  if (done !== 0) return done;

  /* notion's `last_edited_time` is fixed-width iso 8601 in UTC, so comparing
     the strings is comparing the instants */
  return a.lastEdited < b.lastEdited ? 1 : a.lastEdited > b.lastEdited ? -1 : 0;
}

/**
 * one scannable label: `Written · News · "Terps lose again" — Sam R.`
 *
 * status first because that is what an editor is scanning for, and the parts
 * an article does not have yet are dropped rather than rendered empty.
 *
 * only the headline is ever truncated: cutting the prefix would take the
 * status off the front of every long row, which is the one part the ordering
 * is built around.
 */
function nameFor(row: ArticleRow): string {
  const prefix = [row.status, row.section].filter(Boolean).join(" · ");
  const head = prefix ? `${prefix} · ` : "";
  const tail = row.authorByline ? ` — ${row.authorByline}` : "";
  const headline = row.headline.trim() || UNTITLED;

  const room = MAX_CHOICE_NAME - head.length - tail.length - 2; // the quotes

  if (room >= MIN_HEADLINE)
    return `${head}"${clip(headline, room)}"${tail}`.slice(0, MAX_CHOICE_NAME);

  /* no room for a readable headline, so the byline goes first — it is the part
     an editor can most often do without */
  const without = MAX_CHOICE_NAME - head.length - 2;
  if (without >= MIN_HEADLINE) return `${head}"${clip(headline, without)}"`;

  /*
    even the prefix does not fit, which means notion holds a 90-character
    status. a hard cut is not pretty, but an over-long name takes the whole
    dropdown down and this cannot return nothing
  */
  return `${head}"${headline}"`.slice(0, MAX_CHOICE_NAME) || UNTITLED;
}

/** `text`, at most `room` characters, with an ellipsis when it lost anything */
function clip(text: string, room: number): string {
  if (text.length <= room) return text;
  return `${text.slice(0, room - 1).trimEnd()}…`;
}

/**
 * the rows bylined to whoever is asking, or all of them when we cannot tell.
 *
 * what a short query gets instead of a wildcard search: two characters match
 * most of the index and rank badly, so the useful answer to "an editor has
 * just opened the picker" is their own work.
 *
 * a byline is the name that gets *printed* and may be a pseudonym, so a miss
 * means "we cannot tell", never "this person has no articles" — falling back
 * to everything is why an empty dropdown is not the answer to a pen name.
 */
export function mine(
  rows: ArticleRow[],
  name: string | undefined,
): ArticleRow[] {
  if (!name) return rows;

  const wanted = normalise(name);
  const ours = rows.filter((row) => normalise(row.authorByline) === wanted);

  return ours.length > 0 ? ours : rows;
}

/** bylines are typed by hand, so case and stray spaces cannot be load-bearing */
function normalise(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

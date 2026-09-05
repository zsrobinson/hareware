/*
  turning index rows into the dropdown discord shows while an editor types.

  pure functions over rows, because everything that can go wrong here goes
  wrong silently: discord refuses the *entire* autocomplete response when one
  choice name is empty or over its limit, and refusing looks exactly like a
  slow index — an empty dropdown with no explanation. so the rules about
  length, emptiness and the 25 cap live in one place with tests on them, and
  the caller does the D1 read and nothing else. see ADR 0009.

  the matching is here rather than in sql on purpose. the index is 139 rows,
  which is nothing to read whole, and doing it in javascript buys a real fuzzy
  match and a ranking that understands recency. it also retired a `like`
  clause whose escape character was wrong for a day, and which failed by
  showing an empty dropdown.
*/

import { UNTITLED } from "./config";
import type { ArticleRow } from "~/lib/db/schema";
import { MAX_CHOICES } from "~/lib/services/discord/commands";

/** discord rejects the whole response over this, per choice name */
export const MAX_CHOICE_NAME = 100;

export type AutocompleteChoice = { name: string; value: string };

/**
 * how well a headline answers a query, higher being better, 0 being not at all.
 *
 * three tiers rather than a continuous score, because the tie-break is what
 * matters: an editor is nearly always reaching for something they touched this
 * week, so recency decides between two comparable matches and the tiers only
 * keep a genuinely better match above a worse one.
 */
export function quality(headline: string, query: string): number {
  if (!query) return 1;

  const text = fold(headline);
  const wanted = fold(query);
  if (!wanted) return 1;

  if (text.startsWith(wanted)) return 4;

  /* a word boundary, so "leer" ranks a headline about leering above one that
     merely contains the letters somewhere */
  if (text.includes(` ${wanted}`)) return 3;
  if (text.includes(wanted)) return 2;

  return subsequence(text, wanted) ? 1 : 0;
}

/**
 * whether every character of `wanted` appears in `text`, in order.
 *
 * this is the whole of the fuzziness: it forgives a typo that drops a letter,
 * a half-remembered headline and words typed out of an editor's memory rather
 * than off the page. it forgives a *transposition* too, but only by matching
 * fewer characters, which the tiers above already rank below a real match.
 */
function subsequence(text: string, wanted: string): boolean {
  let at = 0;
  for (const character of wanted) {
    at = text.indexOf(character, at) + 1;
    if (at === 0) return false;
  }

  return true;
}

/**
 * case, accents and punctuation removed.
 *
 * headlines carry curly quotes and em dashes that nobody types into a picker,
 * so comparing the raw strings means "Terps' loss" cannot be found by typing
 * "terps loss"
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * the choices for a query, ranked and capped.
 *
 * the value is the notion page id rather than the headline: a headline changes
 * throughout copy edit, so the label an editor scanned and the article they
 * picked have to be identified by different things.
 *
 * only the headline is shown. the status and byline used to be here and were
 * noise — an editor picking an article already knows which one they mean, and
 * the card they get answers everything else.
 */
export function suggestions(
  rows: ArticleRow[],
  query = "",
): AutocompleteChoice[] {
  return rows
    .map((row) => ({ row, score: quality(row.headline, query) }))
    .filter((scored) => scored.score > 0)
    .sort(byScoreThenRecency)
    .slice(0, MAX_CHOICES)
    .map(({ row }) => ({ name: nameFor(row), value: row.pageId }));
}

type Scored = { row: ArticleRow; score: number };

/**
 * a better match first, and among comparable matches the most recently edited.
 *
 * recency is doing most of the work by design: the articles anybody runs a
 * command against are the ones being worked on now, and an empty query — a
 * picker that has only just opened — is exactly this list in exactly that
 * order.
 */
function byScoreThenRecency(a: Scored, b: Scored): number {
  if (a.score !== b.score) return b.score - a.score;

  /* notion's `last_edited_time` is fixed-width iso 8601 in UTC, so comparing
     the strings is comparing the instants */
  return a.row.lastEdited < b.row.lastEdited
    ? 1
    : a.row.lastEdited > b.row.lastEdited
      ? -1
      : 0;
}

/**
 * the headline, and nothing else.
 *
 * an empty name makes discord reject the whole response, so an untitled row
 * gets a word rather than nothing — and the hard cut at the end is what stops
 * a 200-character headline taking the dropdown down with it.
 */
function nameFor(row: ArticleRow): string {
  const headline = row.headline.trim() || UNTITLED;

  return headline.length <= MAX_CHOICE_NAME
    ? headline
    : `${headline.slice(0, MAX_CHOICE_NAME - 1).trimEnd()}…`;
}

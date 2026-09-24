/*
  Articles as the autocomplete dropdown. Discord rejects the whole response if
  any choice name is empty or too long, which looks like an empty dropdown, so
  those rules live here. Matching is local because Notion has no fuzzy filter.
*/

import { UNTITLED } from "~/lib/articles/config";
import type { Article } from "~/lib/articles/page";
import { MAX_CHOICES } from "./commands";

/** discord rejects the whole response over this, per choice name */
const MAX_CHOICE_NAME = 100;

export type AutocompleteChoice = { name: string; value: string };

/**
 * how well a headline answers a query: 0 not at all. Coarse, so recency breaks
 * ties.
 */
function quality(headline: string, query: string): number {
  if (!query) return 1;

  const text = fold(headline);
  const wanted = fold(query);
  if (!wanted) return 1;

  if (text.startsWith(wanted)) return 4;

  if (text.includes(` ${wanted}`)) return 3;
  if (text.includes(wanted)) return 2;

  return subsequence(text, wanted) ? 1 : 0;
}

/** whether every character of `wanted` appears in `text`, in order */
function subsequence(text: string, wanted: string): boolean {
  let at = 0;
  for (const character of wanted) {
    at = text.indexOf(character, at) + 1;
    if (at === 0) return false;
  }

  return true;
}

/**
 * case, accents and punctuation removed, so "terps loss" finds "Terps’ loss"
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** the choices for a query, ranked and capped; the value is the page id */
export function suggestions(rows: Article[], query = ""): AutocompleteChoice[] {
  return rows
    .map((row) => ({ row, score: quality(row.headline, query) }))
    .filter((scored) => scored.score > 0)
    .sort(byScoreThenRecency)
    .slice(0, MAX_CHOICES)
    .map(({ row }) => ({ name: nameFor(row), value: row.pageId }));
}

type Scored = { row: Article; score: number };

/** a better match first, then the most recently edited */
function byScoreThenRecency(a: Scored, b: Scored): number {
  if (a.score !== b.score) return b.score - a.score;

  /* fixed-width UTC ISO 8601, so the strings compare as instants */
  return a.row.lastEdited < b.row.lastEdited
    ? 1
    : a.row.lastEdited > b.row.lastEdited
      ? -1
      : 0;
}

/** the headline, never empty and never over Discord's limit */
function nameFor(row: Article): string {
  const headline = row.headline.trim() || UNTITLED;

  return headline.length <= MAX_CHOICE_NAME
    ? headline
    : `${headline.slice(0, MAX_CHOICE_NAME - 1).trimEnd()}…`;
}

/*
  the questions the log page answers about a row that no single row can answer
  alone, kept out of the component so they can be tested without one.

  none of it is stored. every one is a fact about a row's neighbours or about
  the clock, and a column holding either would go wrong the moment a row was
  inserted out of order or the page was left open
*/

import type { Row } from "./log";

/**
 * a run nobody was watching.
 *
 * the whole point of ADR 0007 is the 8am cron: it posts to a channel and, when
 * it does not, the evidence is an absence. every other source has a person on
 * the other end of it who has already seen what happened — they pressed the
 * button, and the reply told them
 */
export function unattended(row: Pick<Row, "source">) {
  return row.source === "cron";
}

/** the outcomes that mean something went wrong, rather than nothing was due */
const WRONG = new Set<Row["outcome"]>(["failed", "misconfigured"]);

/**
 * a run that went wrong with nobody there to see it.
 *
 * this, and not "failed", is what the page should count. a slash command that
 * came back `failed` because a section editor spelled an Article title wrong
 * is a person mistyping and being told so; the same word against a cron run is
 * the social team's reminder never arriving. counting them together makes the
 * only number anybody reads mean nothing
 */
export function needsAttention(row: Pick<Row, "source" | "outcome">) {
  return unattended(row) && WRONG.has(row.outcome);
}

/** how this run ended relative to the one before it, when that is worth saying */
export type Change = {
  from: Row["outcome"];
  kind: "broke" | "recovered" | "changed";
};

/** a row, plus what the run before it did */
export type Enriched = Row & {
  /** null when there is nothing to compare against, or nothing worth saying */
  change: Change | null;
};

function transition(from: Row["outcome"], to: Row["outcome"]): Change | null {
  if (from === to) return null;
  if (WRONG.has(to) && !WRONG.has(from)) return { from, kind: "broke" };
  if (!WRONG.has(to) && WRONG.has(from)) return { from, kind: "recovered" };
  return { from, kind: "changed" };
}

/**
 * every unattended run, told how it differs from the unattended run before it.
 *
 * only the schedule. a comparison between one slash command and the last one
 * somebody happened to type is not about the software at all — two editors
 * running `/article` an hour apart, one of them mistyping, is not a system
 * that changed state, and marking it as one buries the mornings that did.
 *
 * scoped to one action for the same reason `lastOutcome` scopes its alert: the
 * meeting reminder failing says nothing about the social ping. the input order
 * is kept, whatever it is
 */
export function enrich(rows: Row[]): Enriched[] {
  /* oldest first, so "the run before" is always one already seen */
  const seen = new Map<string, Row["outcome"]>();
  const marked = new Map<number, Change | null>();

  for (const row of [...rows].sort((a, b) => a.at - b.at || a.id - b.id)) {
    if (!unattended(row)) continue;

    const before = seen.get(row.action);
    seen.set(row.action, row.outcome);
    marked.set(row.id, before ? transition(before, row.outcome) : null);
  }

  return rows.map((row) => ({ ...row, change: marked.get(row.id) ?? null }));
}

const RELATIVE = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const STEPS = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.348],
  ["month", 12],
] as const;

/**
 * "4 minutes ago", from a unix-seconds timestamp and the current milliseconds.
 *
 * takes the clock rather than reading it, because a function that read it
 * could not be tested and could not be rendered on the server
 */
export function ago(at: number, now: number): string {
  let amount = at - now / 1000;

  for (const [unit, size] of STEPS) {
    if (Math.abs(amount) < size)
      return RELATIVE.format(Math.round(amount), unit);
    amount /= size;
  }

  return RELATIVE.format(Math.round(amount), "year");
}

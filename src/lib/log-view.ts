/*
  the two things the log page works out for itself, kept out of the component
  so they can be tested without one.

  neither is stored. `changed` is a fact about a pair of rows and `ago` is a
  fact about the clock, and a column in the database holding either would go
  wrong the moment a row was inserted out of order or the page was left open
*/

import type { Row } from "./log";

/** a row, plus what the run before it did */
export type Enriched = Row & {
  /** the outcome of the previous run of the same action from the same source */
  before: Row["outcome"] | null;
  /** it ended differently from that one */
  changed: boolean;
};

/**
 * every row, told what the run before it did.
 *
 * "the run before" is scoped to one action from one source for the same reason
 * `lastOutcome` scopes its alert that way: a run somebody fired by hand from
 * the panel sits between two cron runs and would otherwise make both of them
 * look like something changed. the input order is kept, whatever it is
 */
export function enrich(rows: Row[]): Enriched[] {
  /* oldest first, so "the previous run" is always one already seen */
  const seen = new Map<string, Row["outcome"]>();
  const marked = new Map<number, Enriched>();

  for (const row of [...rows].sort((a, b) => a.at - b.at || a.id - b.id)) {
    const key = `${row.source}:${row.action}`;
    const before = seen.get(key) ?? null;
    seen.set(key, row.outcome);
    marked.set(row.id, {
      ...row,
      before,
      changed: before !== null && before !== row.outcome,
    });
  }

  return rows.map(
    (row) => marked.get(row.id) ?? { ...row, before: null, changed: false },
  );
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

import { expect, test } from "vitest";
import { ago, enrich, needsAttention } from "./log-view";
import type { Row } from "./log";

let next = 1;

const row = (row: Partial<Row> & Pick<Row, "at" | "outcome">): Row => ({
  id: next++,
  source: "cron",
  action: "meeting-reminder",
  summary: "",
  actor: null,
  ...row,
});

test("the first run of an action has nothing to have changed from", () => {
  const [only] = enrich([row({ at: 100, outcome: "failed" })]);

  expect(only.change).toBe(null);
});

test("a scheduled run that starts failing says which way it went", () => {
  const rows = enrich([
    row({ at: 200, outcome: "failed" }),
    row({ at: 100, outcome: "ok" }),
  ]);

  expect(rows[0].change).toEqual({ from: "ok", kind: "broke" });
  expect(rows[1].change).toBe(null);
});

test("and one that starts working again says that too", () => {
  const rows = enrich([
    row({ at: 200, outcome: "ok" }),
    row({ at: 100, outcome: "misconfigured" }),
  ]);

  expect(rows[0].change).toEqual({ from: "misconfigured", kind: "recovered" });
});

test("a quiet morning after a loud one is a change, not a failure", () => {
  const rows = enrich([
    row({ at: 200, outcome: "skipped" }),
    row({ at: 100, outcome: "ok" }),
  ]);

  expect(rows[0].change).toEqual({ from: "ok", kind: "changed" });
});

test("a run that ends the way the last one did says nothing", () => {
  const rows = enrich([
    row({ at: 300, outcome: "failed" }),
    row({ at: 200, outcome: "failed" }),
    row({ at: 100, outcome: "ok" }),
  ]);

  expect(rows.map((it) => it.change?.kind ?? null)).toEqual([
    null,
    "broke",
    null,
  ]);
});

/*
  the marker is about the unattended schedule and nothing else. two editors
  running the same slash command an hour apart, one of them mistyping an
  Article title, is not a system that changed state
*/
test("runs a person fired are never marked as having changed", () => {
  const rows = enrich([
    row({ at: 300, outcome: "failed", source: "command" }),
    row({ at: 200, outcome: "ok", source: "command" }),
    row({ at: 100, outcome: "ok", source: "button" }),
  ]);

  expect(rows.every((it) => it.change === null)).toBe(true);
});

/*
  and a run somebody fired by hand between two cron runs is not "the run
  before" either — otherwise the next morning looks like it changed when it did
  exactly what it did yesterday
*/
test("a hand-fired run does not come between two scheduled ones", () => {
  const rows = enrich([
    row({ at: 300, outcome: "ok" }),
    row({ at: 200, outcome: "failed", source: "manual" }),
    row({ at: 100, outcome: "ok" }),
  ]);

  expect(rows.every((it) => it.change === null)).toBe(true);
});

test("one action's outcome says nothing about another's", () => {
  const rows = enrich([
    row({ at: 300, outcome: "ok" }),
    row({ at: 200, outcome: "failed", action: "social-ping" }),
    row({ at: 100, outcome: "ok" }),
  ]);

  expect(rows.every((it) => it.change === null)).toBe(true);
});

test("the rows come back in the order they went in", () => {
  const given = [
    row({ at: 100, outcome: "ok" }),
    row({ at: 300, outcome: "ok" }),
    row({ at: 200, outcome: "ok" }),
  ];

  expect(enrich(given).map((it) => it.at)).toEqual([100, 300, 200]);
});

/*
  the distinction the counts rest on: the same word means a broken reminder
  against the schedule and a mistyped Article title against a slash command
*/
test("a failure needs attention only when nobody was there to see it", () => {
  expect(needsAttention({ source: "cron", outcome: "failed" })).toBe(true);
  expect(needsAttention({ source: "cron", outcome: "misconfigured" })).toBe(
    true,
  );
  expect(needsAttention({ source: "cron", outcome: "skipped" })).toBe(false);
  expect(needsAttention({ source: "command", outcome: "failed" })).toBe(false);
  expect(needsAttention({ source: "button", outcome: "misconfigured" })).toBe(
    false,
  );
});

test("`ago` reads from the clock it is handed, not the one on the wall", () => {
  const now = 1_800_000_000_000;

  expect(ago(now / 1000 - 240, now)).toBe("4 minutes ago");
  expect(ago(now / 1000 - 7200, now)).toBe("2 hours ago");
  expect(ago(now / 1000 - 86_400, now)).toBe("yesterday");
  expect(ago(now / 1000 - 400 * 86_400, now)).toBe("last year");
  expect(ago(now / 1000 - 10, now)).toBe("10 seconds ago");
});

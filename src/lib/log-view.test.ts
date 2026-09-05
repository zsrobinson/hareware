import { expect, test } from "vitest";
import { ago, enrich } from "./log-view";
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

  expect(only.before).toBe(null);
  expect(only.changed).toBe(false);
});

test("a run that ends differently from the one before it is marked", () => {
  const rows = enrich([
    row({ at: 200, outcome: "failed" }),
    row({ at: 100, outcome: "ok" }),
  ]);

  expect(rows.map((it) => it.changed)).toEqual([true, false]);
  expect(rows[0].before).toBe("ok");
});

test("a run that ends the same way is not", () => {
  const rows = enrich([
    row({ at: 300, outcome: "failed" }),
    row({ at: 200, outcome: "failed" }),
    row({ at: 100, outcome: "ok" }),
  ]);

  expect(rows.map((it) => it.changed)).toEqual([false, true, false]);
});

/*
  the bug this rules out: a `manual` run fired from the panel between two cron
  runs used to be "the run before", so the next morning's cron looked like it
  had changed when it had done exactly what it did yesterday
*/
test("a run is compared against its own source and action only", () => {
  const rows = enrich([
    row({ at: 300, outcome: "ok" }),
    row({ at: 200, outcome: "failed", source: "manual" }),
    row({ at: 250, outcome: "ok", action: "social-ping" }),
    row({ at: 100, outcome: "ok" }),
  ]);

  expect(rows.map((it) => it.changed)).toEqual([false, false, false, false]);
});

test("the rows come back in the order they went in", () => {
  const given = [
    row({ at: 100, outcome: "ok" }),
    row({ at: 300, outcome: "ok" }),
    row({ at: 200, outcome: "ok" }),
  ];

  expect(enrich(given).map((it) => it.at)).toEqual([100, 300, 200]);
});

test("`ago` reads from the clock it is handed, not the one on the wall", () => {
  const now = 1_800_000_000_000;

  expect(ago(now / 1000 - 240, now)).toBe("4 minutes ago");
  expect(ago(now / 1000 - 7200, now)).toBe("2 hours ago");
  expect(ago(now / 1000 - 86_400, now)).toBe("yesterday");
  expect(ago(now / 1000 - 400 * 86_400, now)).toBe("last year");
  expect(ago(now / 1000 - 10, now)).toBe("10 seconds ago");
});

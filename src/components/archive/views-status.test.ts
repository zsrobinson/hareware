import { expect, test } from "vitest";
import { viewsStatus } from "./archive-shell";

const now = Date.parse("2026-11-09T16:00:00Z");
const unavailable = {
  status: "unavailable",
  reason: "WordPress stats are busy",
} as const;

/* Reload after a failed read asks again; until it answers, that is what
   the page is doing, not still failing */
test("views asked for again after they could not be read are being checked", () => {
  expect(
    viewsStatus({ summary: unavailable, checking: true, failed: true }, now),
  ).toEqual({ text: "Checking views again…", warn: false });
  expect(
    viewsStatus({ summary: unavailable, checking: false, failed: true }, now),
  ).toEqual({ text: "Views unavailable", warn: true });
});

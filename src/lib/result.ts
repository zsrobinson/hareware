/* How anything reports what it did: a quiet morning must not look like a broken
   one. */

import type { Row } from "~/lib/db/schema";

export type Outcome = Row["outcome"];

export type Result = { outcome: Outcome; summary: string };

export const ok = (summary: string): Result => ({ outcome: "ok", summary });
export const skipped = (summary: string): Result => ({
  outcome: "skipped",
  summary,
});
export const misconfigured = (summary: string): Result => ({
  outcome: "misconfigured",
  summary,
});
/** for a failure the caller caught itself rather than threw */
export const failed = (summary: string): Result => ({
  outcome: "failed",
  summary,
});

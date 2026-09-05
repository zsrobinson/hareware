/*
  how anything here reports what it did.

  four outcomes rather than a boolean, because "did it throw" is the wrong
  question: the reminders return rather than throw on their most important
  failures, so a week of wordpress refusing the feed once wrote seven rows
  saying `ok`. a quiet morning and a broken one have to differ by more than
  prose nobody reads past the badge.

  here rather than in `automations/registry` — where it was — because six
  modules that are not automations import it, two of them under `services/`,
  whose whole rule is that it knows nothing about the layer above it. a shared
  vocabulary is not a registry.
*/

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

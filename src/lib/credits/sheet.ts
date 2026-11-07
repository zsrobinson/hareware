/*
  The club's Sheet: who is really behind a credit, by WordPress post id, and
  which labels count as credits. It is an override, never a copy of WordPress:
  a post with no rows is credited exactly as printed.

  What it says is private. It never leaves the signed-in pages, and nothing
  from it is written to WordPress or the repository.
*/

import type { Rows, Sheets } from "~/lib/services/google/sheets";
import { DEFAULT_LABELS, ROLES, isRole, type Label, type Role } from "./labels";

export const OVERRIDES_TAB = "Overrides";
export const LABELS_TAB = "Labels";
export const IGNORED_TAB = "Ignored";

export const OVERRIDE_HEADER = ["post_id", "role", "real_name", "note"];
export const LABEL_HEADER = ["label", "role"];
export const IGNORED_HEADER = ["post_id", "note"];

/** a post somebody decided is fine as it is: its problems are not listed */
export type Ignored = { postId: number; note: string; row: number };

/** one person behind one role on one post. Several rows make co-credits */
export type Override = {
  postId: number;
  role: Role;
  realName: string;
  row: number;
};

/** a row the Sheet holds that HareWare could not use, and why */
export type SheetProblem = { tab: string; row: number; message: string };

export type SheetState =
  | { status: "unconfigured"; missing: string[] }
  | { status: "failed"; reason: string }
  | {
      status: "read";
      overrides: Override[];
      ignored: Ignored[];
      /** null when the Labels tab is absent or empty: the defaults apply */
      labels: Label[] | null;
      problems: SheetProblem[];
      tabs: { overrides: boolean; labels: boolean; ignored: boolean };
    };

export async function readSheet(sheets: Sheets): Promise<SheetState> {
  try {
    const found = await sheets.read([OVERRIDES_TAB, LABELS_TAB, IGNORED_TAB]);
    const problems: SheetProblem[] = [];

    const overrides = parseOverrides(found.get(OVERRIDES_TAB) ?? [], problems);
    const ignored = parseIgnored(found.get(IGNORED_TAB) ?? [], problems);
    const labelRows = found.get(LABELS_TAB);
    const labels = labelRows ? parseLabels(labelRows, problems) : [];

    return {
      status: "read",
      overrides,
      ignored,
      labels: labels.length > 0 ? labels : null,
      problems,
      tabs: {
        overrides: found.has(OVERRIDES_TAB),
        labels: found.has(LABELS_TAB),
        ignored: found.has(IGNORED_TAB),
      },
    };
  } catch (error) {
    return {
      status: "failed",
      reason: String(error instanceof Error ? error.message : error),
    };
  }
}

/** the labels in force: the Sheet's when it has any */
export function labelsIn(state: SheetState): Label[] {
  return state.status === "read" && state.labels
    ? state.labels
    : DEFAULT_LABELS;
}

/**
 * Creates whichever tab is missing, with its header, and fills an empty
 * Labels tab with the defaults so the list in force is the list on screen.
 * Never touches a row somebody wrote.
 */
export async function setUpSheet(sheets: Sheets): Promise<string[]> {
  const done: string[] = [];
  const tabs = new Set(await sheets.tabs());
  const existing = await sheets.read([OVERRIDES_TAB, LABELS_TAB, IGNORED_TAB]);

  if (!tabs.has(OVERRIDES_TAB)) {
    await sheets.addTab(OVERRIDES_TAB);
    done.push(`created ${OVERRIDES_TAB}`);
  }
  if ((existing.get(OVERRIDES_TAB) ?? []).length === 0) {
    await sheets.write(OVERRIDES_TAB, [OVERRIDE_HEADER]);
    done.push(`wrote ${OVERRIDES_TAB}'s header`);
  }

  if (!tabs.has(LABELS_TAB)) {
    await sheets.addTab(LABELS_TAB);
    done.push(`created ${LABELS_TAB}`);
  }
  if ((existing.get(LABELS_TAB) ?? []).length <= 1) {
    await sheets.write(LABELS_TAB, [
      LABEL_HEADER,
      ...DEFAULT_LABELS.map((label) => [label.label, label.role]),
    ]);
    done.push(`wrote the default labels`);
  }

  if (!tabs.has(IGNORED_TAB)) {
    await sheets.addTab(IGNORED_TAB);
    done.push(`created ${IGNORED_TAB}`);
  }
  if ((existing.get(IGNORED_TAB) ?? []).length === 0) {
    await sheets.write(IGNORED_TAB, [IGNORED_HEADER]);
    done.push(`wrote ${IGNORED_TAB}'s header`);
  }

  return done;
}

/** records that a post's problems are intended, creating the tab if need be */
export async function markFine(sheets: Sheets, postId: number, note: string) {
  if (!(await sheets.tabs()).includes(IGNORED_TAB)) {
    await sheets.addTab(IGNORED_TAB);
    await sheets.write(IGNORED_TAB, [IGNORED_HEADER]);
  }
  await sheets.append(IGNORED_TAB, [[String(postId), note]]);
}

function parseIgnored(rows: Rows, problems: SheetProblem[]): Ignored[] {
  const ignored: Ignored[] = [];
  rows.forEach((cells, index) => {
    const row = index + 1;
    if (row === 1 && isHeader(cells, IGNORED_HEADER)) return;
    const [rawId = "", note = ""] = cells.map((cell) => cell.trim());
    if (!rawId && !note) return;
    const postId = Number(rawId);
    if (!Number.isInteger(postId) || postId <= 0)
      problems.push({
        tab: IGNORED_TAB,
        row,
        message: `"${rawId}" is not a WordPress post id`,
      });
    else ignored.push({ postId, note, row });
  });
  return ignored;
}

function parseOverrides(rows: Rows, problems: SheetProblem[]): Override[] {
  const overrides: Override[] = [];

  rows.forEach((cells, index) => {
    const row = index + 1;
    if (row === 1 && isHeader(cells, OVERRIDE_HEADER)) return;

    const [rawId = "", rawRole = "", rawName = ""] = cells.map((cell) =>
      cell.trim(),
    );
    if (!rawId && !rawRole && !rawName) return;

    const postId = Number(rawId);
    const role = rawRole.toLowerCase();
    const complaint =
      !Number.isInteger(postId) || postId <= 0
        ? `"${rawId}" is not a WordPress post id`
        : !isRole(role)
          ? `role must be one of ${ROLES.join(", ")}, not "${rawRole}"`
          : !rawName
            ? "real_name is empty"
            : undefined;

    if (complaint)
      problems.push({ tab: OVERRIDES_TAB, row, message: complaint });
    else overrides.push({ postId, role: role as Role, realName: rawName, row });
  });

  return overrides;
}

function parseLabels(rows: Rows, problems: SheetProblem[]): Label[] {
  const labels: Label[] = [];

  rows.forEach((cells, index) => {
    const row = index + 1;
    if (row === 1 && isHeader(cells, LABEL_HEADER)) return;

    const [label = "", rawRole = ""] = cells.map((cell) =>
      cell.trim().replace(/:$/, ""),
    );
    if (!label && !rawRole) return;

    const role = rawRole.toLowerCase();
    if (!label)
      problems.push({ tab: LABELS_TAB, row, message: "label is empty" });
    else if (!isRole(role))
      problems.push({
        tab: LABELS_TAB,
        row,
        message: `role must be one of ${ROLES.join(", ")}, not "${rawRole}"`,
      });
    else labels.push({ label, role });
  });

  return labels;
}

function isHeader(cells: string[], header: string[]) {
  return cells[0]?.trim().toLowerCase() === header[0];
}

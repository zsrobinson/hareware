/*
  The club's Sheet: the few facts WordPress does not hold. Three tabs, each
  read by its header row so the columns can be in any order:

    Overrides  who a printed byline really is, for every article or one
    Labels     which paragraph labels are credit lines, and their roles
    Ignored    articles whose problems are intended

  HareWare reads it on every load and writes it from the signed-in pages, so
  nobody needs to open it in normal use. What it says is private: it never
  reaches WordPress, the repository, the log, or a page outside the board's.
*/

import type { Rows, Sheets } from "~/lib/services/google/sheets";
import { DEFAULT_LABELS, ROLES, isRole, type Label, type Role } from "./labels";

export const TABS = {
  overrides: "Overrides",
  labels: "Labels",
  ignored: "Ignored",
} as const;
type Tab = keyof typeof TABS;

/** each tab's columns, in the order HareWare writes them */
const COLUMNS: Record<Tab, string[]> = {
  overrides: ["post_id", "role", "byline", "real_name", "note"],
  labels: ["label", "role"],
  ignored: ["post_id", "names", "note"],
};

/**
 * One fact about a byline. With no `postId` it holds on every article, so a
 * pen name needs one row however often it is used; with one, it holds on
 * that article only and wins over an everywhere row. With no `byline` it adds
 * a person the article does not print.
 */
export type Override = {
  postId: number | null;
  /** null for any role */
  role: Role | null;
  /** the printed name this replaces; null to add someone unprinted */
  byline: string | null;
  realName: string;
  note: string;
};

/**
 * something someone decided is fine: an article whose problems are intended,
 * or two similar names that are different people
 */
export type Ignored = {
  postId: number | null;
  /** a pair of names, as `pairKey` writes it */
  names: string | null;
  note: string;
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
      /** which tabs exist; a missing one is created on the first write */
      tabs: Record<Tab, boolean>;
    };

/* ---- reading -------------------------------------------------------------- */

export async function readSheet(sheets: Sheets): Promise<SheetState> {
  try {
    const found = await sheets.read(Object.values(TABS));
    const problems: SheetProblem[] = [];

    const overrides = table("overrides", found.get(TABS.overrides))
      .map((row) => toOverride(row, problems))
      .filter((o): o is Override => o !== undefined);
    const ignored = table("ignored", found.get(TABS.ignored))
      .map((row) => toIgnored(row, problems))
      .filter((i): i is Ignored => i !== undefined);
    const labels = table("labels", found.get(TABS.labels))
      .map((row) => toLabel(row, problems))
      .filter((l): l is Label => l !== undefined);

    return {
      status: "read",
      overrides,
      ignored,
      labels: labels.length > 0 ? labels : null,
      problems,
      tabs: {
        overrides: found.has(TABS.overrides),
        labels: found.has(TABS.labels),
        ignored: found.has(TABS.ignored),
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

type Row = { row: number; cells: Record<string, string> };

/**
 * a tab's rows keyed by column name, from its header when it has one. A tab
 * typed in by hand without a header is read in HareWare's column order
 */
function table(tab: Tab, rows: Rows | undefined): Row[] {
  if (!rows || rows.length === 0) return [];
  const known = COLUMNS[tab];
  const first = rows[0]!.map((cell) => cell.trim().toLowerCase());
  const hasHeader = first.some((cell) => known.includes(cell));
  const columns = hasHeader ? first : known;

  return rows
    .slice(hasHeader ? 1 : 0)
    .map((cells, index) => ({
      row: index + (hasHeader ? 2 : 1),
      cells: Object.fromEntries(
        columns.map((name, i) => [name, (cells[i] ?? "").trim()]),
      ),
    }))
    .filter(({ cells }) => Object.values(cells).some(Boolean));
}

function postIdOf(raw: string): number | null | undefined {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function roleOf(raw: string): Role | null | undefined {
  if (!raw) return null;
  const role = raw.toLowerCase();
  return isRole(role) ? role : undefined;
}

function toOverride({ row, cells }: Row, problems: SheetProblem[]) {
  const postId = postIdOf(cells.post_id ?? "");
  const role = roleOf(cells.role ?? "");
  const byline = cells.byline || null;
  const realName = cells.real_name ?? "";
  const complaint =
    postId === undefined
      ? `"${cells.post_id}" is not a WordPress post id`
      : role === undefined
        ? `role must be blank or one of ${ROLES.join(", ")}, not "${cells.role}"`
        : !realName
          ? "real_name is empty"
          : !byline && postId === null
            ? "a row with no byline needs a post_id"
            : undefined;
  if (complaint) {
    problems.push({ tab: TABS.overrides, row, message: complaint });
    return undefined;
  }
  return {
    /* the checks above ruled out undefined; null is meaningful */
    postId: postId as number | null,
    role: role as Role | null,
    byline,
    realName,
    note: cells.note ?? "",
  } satisfies Override;
}

function toIgnored({ row, cells }: Row, problems: SheetProblem[]) {
  const postId = postIdOf(cells.post_id ?? "");
  const names = cells.names || null;
  if (postId === undefined || (postId === null && !names)) {
    problems.push({
      tab: TABS.ignored,
      row,
      message:
        postId === undefined
          ? `"${cells.post_id}" is not a WordPress post id`
          : "the row needs a post_id or a pair of names",
    });
    return undefined;
  }
  return { postId, names, note: cells.note ?? "" } satisfies Ignored;
}

function toLabel({ row, cells }: Row, problems: SheetProblem[]) {
  const label = (cells.label ?? "").replace(/:$/, "").trim();
  const role = roleOf(cells.role ?? "");
  if (!label || !role) {
    problems.push({
      tab: TABS.labels,
      row,
      message: !label
        ? "label is empty"
        : `role must be one of ${ROLES.join(", ")}, not "${cells.role}"`,
    });
    return undefined;
  }
  return { label, role } satisfies Label;
}

/* ---- writing -------------------------------------------------------------- */

/*
  Every write reads the tab, changes the rows it means to, and writes the tab
  back whole, keeping every row it did not mean to change exactly as it was,
  including ones it could not parse. Two people saving at the same moment is
  last-writer-wins, which a club of editors can live with.
*/

async function rewrite(
  sheets: Sheets,
  tab: Tab,
  change: (rows: Rows) => Rows,
): Promise<void> {
  const title = TABS[tab];
  const found = await sheets.read([title]);
  if (!found.has(title)) await sheets.addTab(title);

  const current = found.get(title) ?? [];
  const known = COLUMNS[tab];
  const hasHeader =
    current.length > 0 &&
    current[0]!.some((cell) => known.includes(cell.trim().toLowerCase()));
  const header = hasHeader
    ? current[0]!.map((cell) => cell.trim().toLowerCase())
    : known;
  const body = hasHeader ? current.slice(1) : current;

  /* the change works in HareWare's column order whatever the tab's own is */
  const toKnown = (cells: string[]) =>
    known.map((name) => cells[header.indexOf(name)] ?? "");
  const fromKnown = (cells: string[]) =>
    header.map((name) => cells[known.indexOf(name)] ?? "");

  const changed = change(body.map(toKnown)).map(fromKnown);
  await sheets.replace(title, [header, ...changed]);
}

const blank = (cells: string[]) => cells.every((cell) => !cell.trim());

/**
 * says who bylines really are on every article, one entry per pen name; an
 * entry with no real name removes that pen name. A pen name two people share
 * gets one entry per person
 */
export async function setPenNames(
  sheets: Sheets,
  entries: { byline: string; realName: string }[],
  note = "",
) {
  const bylines = entries.map((entry) => entry.byline);
  await rewrite(sheets, "overrides", (rows) => [
    ...rows.filter(
      ([postId = "", , printed = ""]) =>
        !(postId.trim() === "" && bylines.some((b) => same(printed, b))),
    ),
    ...entries
      .filter((entry) => entry.realName.trim())
      .map((entry) => [
        "",
        "",
        entry.byline.trim(),
        entry.realName.trim(),
        note,
      ]),
  ]);
}

/**
 * replaces what the Sheet says about one article's credits in one role. Each
 * entry is a printed byline and who it counts as, or a person with no byline
 * to add someone the article does not print. An empty list returns the role
 * to the everywhere rows and the printed credit line
 */
export async function setArticleCredits(
  sheets: Sheets,
  postId: number,
  role: Role,
  entries: { byline: string | null; realName: string }[],
  note = "",
) {
  await rewrite(sheets, "overrides", (rows) => [
    ...rows.filter(
      ([id = "", rowRole = ""]) =>
        !(
          id.trim() === String(postId) && rowRole.trim().toLowerCase() === role
        ),
    ),
    ...entries
      .filter((entry) => entry.realName.trim())
      .map((entry) => [
        String(postId),
        role,
        entry.byline?.trim() ?? "",
        entry.realName.trim(),
        note,
      ]),
  ]);
}

/**
 * says who one byline is, on every article and on particular ones, in one
 * write: the way a pen name passes from one person to another (the earlier
 * articles keep the first, new ones count as the second). `everywhere` left
 * out keeps the every-article rows as they are; an article entry replaces that
 * byline's rows on that article and role (a null role is a row for any role),
 * and an empty list of names returns it to `everywhere`
 */
export async function setByline(
  sheets: Sheets,
  byline: string,
  everywhere: string[] | undefined,
  articles: { postId: number; role: Role | null; realNames: string[] }[],
  note = "",
) {
  const printedAs = byline.trim();
  await rewrite(sheets, "overrides", (rows) => [
    ...rows.filter(([postId = "", rowRole = "", printed = ""]) => {
      if (!same(printed, printedAs)) return true;
      const id = postId.trim();
      const role = rowRole.trim().toLowerCase();
      if (id === "") return everywhere === undefined;
      return !articles.some(
        (a) => String(a.postId) === id && (a.role ?? "") === role,
      );
    }),
    ...(everywhere ?? [])
      .filter((name) => name.trim())
      .map((name) => ["", "", printedAs, name.trim(), note]),
    ...articles.flatMap((a) =>
      a.realNames
        .filter((name) => name.trim())
        .map((name) => [
          String(a.postId),
          a.role ?? "",
          printedAs,
          name.trim(),
          note,
        ]),
    ),
  ]);
}

/** the whole list of credit labels, as the Settings page edits it */
export async function setLabels(sheets: Sheets, labels: Label[]) {
  await rewrite(sheets, "labels", () =>
    labels.map((label) => [label.label.trim(), label.role]),
  );
}

/** lists an article as fine as it is, or takes it off that list */
export async function setIgnored(
  sheets: Sheets,
  postId: number,
  ignored: boolean,
  note = "",
) {
  await rewrite(sheets, "ignored", (rows) => [
    ...rows.filter(
      (cells) => blank(cells) || cells[0]!.trim() !== String(postId),
    ),
    ...(ignored ? [[String(postId), "", note]] : []),
  ]);
}

/** records that two similar names are different people, or undoes it */
export async function setDifferentPeople(
  sheets: Sheets,
  names: [string, string],
  different: boolean,
  note = "",
) {
  const key = pairKey(names);
  await rewrite(sheets, "ignored", (rows) => [
    ...rows.filter((cells) => blank(cells) || (cells[1] ?? "").trim() !== key),
    ...(different ? [["", key, note]] : []),
  ]);
}

/** a pair of names as the Ignored tab stores it, in a fixed order */
export function pairKey(names: [string, string]) {
  return [...names].sort().join(" | ");
}

/** names compared as people type them: case and spacing do not count */
export function same(a: string, b: string) {
  const fold = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return fold(a) === fold(b);
}

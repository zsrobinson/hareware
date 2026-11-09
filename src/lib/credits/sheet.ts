/*
  The club's Sheet: the few facts WordPress does not hold, and the board's
  views of the archive. Four tabs, each read by its header row so the columns
  can be in any order:

    Overrides  who a printed byline really is, on one article
    Labels     which paragraph labels are credit lines, and their roles
    Ignored    articles whose problems are intended
    Views      each archive page's views, shared by the board (ADR 0015)

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
  views: "Views",
} as const;
type Tab = keyof typeof TABS;

/** each tab's columns, in the order HareWare writes them */
const COLUMNS: Record<Tab, string[]> = {
  overrides: ["post_id", "role", "byline", "real_name", "note"],
  labels: ["label", "role"],
  ignored: ["post_id", "names", "note"],
  views: ["id", "page", "position", "view", "updated by", "updated at"],
};

/**
 * One fact about one article's credits: who a printed byline really is there,
 * or, with no `byline`, someone the article does not print. A row never
 * reaches past its own article (ADR 0013).
 */
export type Override = {
  postId: number;
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

/**
 * a row with a byline and no post id: it counts nowhere (ADR 0013), and
 * Settings offers to set it on the articles that print it
 */
export type Unscoped = {
  byline: string;
  role: Role | null;
  realName: string;
  note: string;
};

/**
 * A row of the Views tab as it stands. The declaration is the browser's to
 * read and check, as it reads a view from a link: the Worker passes it on as
 * the text it is (ADR 0012, ADR 0015).
 */
export type ViewRow = {
  row: number;
  id: string;
  page: string;
  position: string;
  view: string;
  updatedBy: string;
  updatedAt: string;
};

/** a row the Sheet holds that HareWare could not use, and why */
export type SheetProblem = { tab: string; row: number; message: string };

export type SheetState =
  | { status: "unconfigured"; missing: string[] }
  | { status: "failed"; reason: string }
  | {
      status: "read";
      overrides: Override[];
      unscoped: Unscoped[];
      ignored: Ignored[];
      /** null when the Labels tab is absent or empty: the defaults apply */
      labels: Label[] | null;
      /** every row of the Views tab with anything in it, unread */
      views: ViewRow[];
      problems: SheetProblem[];
      /** which tabs exist; a missing one is created on the first write */
      tabs: Record<Tab, boolean>;
    };

/* ---- reading -------------------------------------------------------------- */

export async function readSheet(sheets: Sheets): Promise<SheetState> {
  try {
    const found = await sheets.read(Object.values(TABS));
    const problems: SheetProblem[] = [];

    const read = table("overrides", found.get(TABS.overrides))
      .map((row) => toOverride(row, problems))
      .filter((o) => o !== undefined);
    const overrides = read.filter((o): o is Override => "postId" in o);
    const unscoped = read.filter((o): o is Unscoped => !("postId" in o));
    const ignored = table("ignored", found.get(TABS.ignored))
      .map((row) => toIgnored(row, problems))
      .filter((i): i is Ignored => i !== undefined);
    const labels = table("labels", found.get(TABS.labels))
      .map((row) => toLabel(row, problems))
      .filter((l): l is Label => l !== undefined);

    return {
      status: "read",
      overrides,
      unscoped,
      ignored,
      labels: labels.length > 0 ? labels : null,
      views: table("views", found.get(TABS.views)).map(toViewRow),
      problems,
      tabs: {
        overrides: found.has(TABS.overrides),
        labels: found.has(TABS.labels),
        ignored: found.has(TABS.ignored),
        views: found.has(TABS.views),
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

function toOverride(
  { row, cells }: Row,
  problems: SheetProblem[],
): Override | Unscoped | undefined {
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
          : postId === null && !byline
            ? "the row needs a post_id"
            : !byline && !role
              ? "a row that adds someone needs a role"
              : undefined;
  if (complaint) {
    problems.push({ tab: TABS.overrides, row, message: complaint });
    return undefined;
  }
  if (postId === null)
    return {
      byline: byline!,
      role: role as Role | null,
      realName,
      note: cells.note ?? "",
    };
  return {
    postId: postId as number,
    role: role as Role | null,
    byline,
    realName,
    note: cells.note ?? "",
  } satisfies Override;
}

const toViewRow = ({ row, cells }: Row): ViewRow => ({
  row,
  id: cells.id ?? "",
  page: cells.page ?? "",
  position: cells.position ?? "",
  view: cells.view ?? "",
  updatedBy: cells["updated by"] ?? "",
  updatedAt: cells["updated at"] ?? "",
});

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

/* a post id as typed: "0123" and "123" are one article */
const isPost = (cell: string, postId: number) =>
  cell.trim() !== "" && Number(cell.trim()) === postId;

/** a byline the role being saved prints, and the article's other roles that
    print it too */
export type PrintedElsewhere = { byline: string; roles: Role[] };

/**
 * replaces what the Sheet says about one article's credits in one role. Each
 * entry is a printed byline and who it counts as, or a person with no byline
 * to add someone the article does not print. An empty list returns the role
 * to its printed credit line.
 *
 * A row for any role covers this role too, so saving one would leave it
 * standing beside the new rows. For each byline `elsewhere` names, such a row
 * is split instead: kept, as explicit rows, for the other roles that print
 * it. Any-role rows for bylines it does not name are left as they are.
 */
export async function setArticleCredits(
  sheets: Sheets,
  postId: number,
  role: Role,
  entries: { byline: string | null; realName: string }[],
  elsewhere: PrintedElsewhere[] = [],
  note = "",
) {
  await rewrite(sheets, "overrides", (rows) => [
    ...rows.flatMap((cells) => {
      const [id = "", rowRole = "", printed = ""] = cells;
      if (!isPost(id, postId)) return [cells];
      const r = rowRole.trim().toLowerCase();
      if (r === role) return [];
      if (r !== "" || !printed.trim()) return [cells];
      const here = elsewhere.find((e) => same(e.byline, printed));
      if (!here) return [cells];
      return here.roles.map((other) => {
        const split = [...cells];
        split[1] = other;
        return split;
      });
    }),
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

/** who a byline is on one article and role: no names returns it to as printed */
export type BylineOn = {
  postId: number;
  /** null for a row that holds in any role */
  role: Role | null;
  byline: string;
  realNames: string[];
  /** kept on the rows written, as a pasted note is; otherwise they are signed */
  note?: string;
};

/**
 * says who bylines are on particular articles, in one write: each entry
 * replaces that byline's rows on that article and role. `retire` removes
 * exactly these rows with no post id, and `restore` writes such rows back, so
 * removing or converting them can be undone
 */
export async function setBylines(
  sheets: Sheets,
  entries: BylineOn[],
  retire: Unscoped[] = [],
  restore: Unscoped[] = [],
  note = "",
) {
  await rewrite(sheets, "overrides", (rows) => [
    ...rows.filter(([postId = "", rowRole = "", printed = "", name = ""]) => {
      const role = rowRole.trim().toLowerCase();
      if (postId.trim() === "")
        return !retire.some(
          (u) =>
            same(printed, u.byline) &&
            role === (u.role ?? "") &&
            same(name, u.realName),
        );
      return !entries.some(
        (e) =>
          isPost(postId, e.postId) &&
          (e.role ?? "") === role &&
          same(printed, e.byline),
      );
    }),
    ...entries.flatMap((e) =>
      e.realNames
        .filter((name) => name.trim())
        .map((name) => [
          String(e.postId),
          e.role ?? "",
          e.byline.trim(),
          name.trim(),
          e.note?.trim() || note,
        ]),
    ),
    ...restore.map((u) => ["", u.role ?? "", u.byline, u.realName, u.note]),
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

/* ---- views ---------------------------------------------------------------- */

/** the archive pages that have views, as the Views tab's page column names them */
export const PAGES = ["articles", "people"] as const;
export type Page = (typeof PAGES)[number];
export const isPage = (value: unknown): value is Page =>
  PAGES.includes(value as Page);

/**
 * A view as the Views tab stores it: the declaration, with `"v": 1`, less
 * its id and page, which are columns of their own. The browser shapes and
 * checks it; here it is only written down.
 */
export type StoredView = { id: string; view: Record<string, unknown> };

/** the page's views changed since the copy a write was based on */
export class ViewConflict extends Error {}

/**
 * One change to a page's views. Each carries what its writer's copy was
 * based on: a view's `updated at`, or for a reorder the order it saw.
 */
export type ViewWrite =
  | {
      kind: "save" | "rename";
      id: string;
      view: Record<string, unknown>;
      basedOn: string;
    }
  | {
      kind: "create";
      id: string;
      view: Record<string, unknown>;
      /** where it goes; after the page's last view otherwise */
      position?: number;
    }
  | { kind: "delete"; id: string; basedOn: string }
  | { kind: "reorder"; order: string[]; basedOn: string[] }
  /** the page's views replaced by its starter set */
  | { kind: "restore" };

/* the Views tab's columns, in HareWare's order */
const ID = 0;
const PAGE = 1;
const POSITION = 2;
const VIEW = 3;
const BY = 4;
const AT = 5;

/** a page's views in order: by position, then as the tab lists them */
export function inOrder<T extends { position: number }>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.position - b.row.position || a.index - b.index)
    .map(({ row }) => row);
}

/**
 * Changes one page's views and returns the `updated at` it wrote. It touches
 * only the rows the write means; and a page with no rows yet, which shows
 * its starter set, gets that set written with the change, so the first write
 * keeps the views everyone was looking at. `starter` is that set as the
 * writer saw it: given when its copy was the starter set, which refuses if
 * someone has written the page since, and absent when its copy was the tab,
 * which refuses if the page's rows have gone.
 *
 * A move changes positions alone, which is not a change to any view: it
 * leaves `updated by` and `updated at` as they were, so nobody editing one
 * of them meets a conflict because a tab moved.
 */
export async function writeViews(
  sheets: Sheets,
  page: Page,
  write: ViewWrite,
  {
    starter,
    who,
    at = new Date().toISOString(),
  }: { starter: StoredView[] | null; who: string; at?: string },
): Promise<string> {
  const conflict = (message: string) => {
    throw new ViewConflict(message);
  };
  const stored = (view: Record<string, unknown>) => JSON.stringify(view);
  const rowOf = ({ id, view }: StoredView, position: number) => [
    id,
    page,
    String(position),
    stored(view),
    "",
    "",
  ];

  await rewrite(sheets, "views", (rows) => {
    const ofPage = (cells: string[]) =>
      !blank(cells) && same(cells[PAGE] ?? "", page);
    let next = rows.map((cells) => [...cells]);
    const stamped = new Set<string[]>();

    if (write.kind === "restore") {
      if (!starter) conflict("Restoring needs the starter views");
      const fresh = starter!.map((view, i) => rowOf(view, i + 1));
      fresh.forEach((cells) => stamped.add(cells));
      next = [...next.filter((cells) => !ofPage(cells)), ...fresh];
    } else if (starter) {
      if (next.some(ofPage))
        conflict("Someone saved this page's views since you opened it");
      const fresh = starter.map((view, i) => rowOf(view, i + 1));
      fresh.forEach((cells) => stamped.add(cells));
      next.push(...fresh);
    } else if (!next.some(ofPage))
      conflict("This page's views left the Sheet since you opened it");

    const find = (id: string) =>
      next.find((cells) => ofPage(cells) && cells[ID]!.trim() === id);
    const changed = (cells: string[] | undefined, basedOn: string) => {
      if (!cells) conflict("Someone deleted this view since you opened it");
      if ((cells![AT] ?? "").trim() !== basedOn)
        conflict("Someone changed this view since you opened it");
      return cells!;
    };
    const order = () =>
      inOrder(
        next
          .filter(ofPage)
          .map((cells) => ({ cells, position: Number(cells[POSITION]) || 0 })),
      ).map(({ cells }) => cells[ID]!.trim());

    switch (write.kind) {
      case "save":
      case "rename": {
        const cells = changed(find(write.id), write.basedOn);
        cells[VIEW] = stored(write.view);
        stamped.add(cells);
        break;
      }
      case "create": {
        if (find(write.id)) conflict("Someone made a view with this id first");
        const last = Math.max(
          0,
          ...next.filter(ofPage).map((cells) => Number(cells[POSITION]) || 0),
        );
        const cells = rowOf(write, write.position ?? last + 1);
        next.push(cells);
        stamped.add(cells);
        break;
      }
      case "delete": {
        const cells = changed(find(write.id), write.basedOn);
        next = next.filter((each) => each !== cells);
        break;
      }
      case "reorder": {
        const now = order();
        const equal = (a: string[], b: string[]) =>
          a.length === b.length && a.every((id, i) => id === b[i]);
        if (!equal(now, write.basedOn))
          conflict("Someone changed this page's views since you opened it");
        if (!equal([...now].sort(), [...write.order].sort()))
          conflict("A move has to keep every view");
        write.order.forEach((id, index) => {
          find(id)![POSITION] = String(index + 1);
        });
        break;
      }
    }

    for (const cells of stamped) {
      while (cells.length < 6) cells.push("");
      cells[BY] = who;
      cells[AT] = at;
    }
    return next;
  });
  return at;
}

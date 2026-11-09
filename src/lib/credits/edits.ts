/*
  What the signed-in pages may change in the Sheet, checked before anything is
  written. Each edit says how to log itself, and the log line never carries a
  real name: the log is not where the Sheet's secrets go. A view's words are
  the board's too, so a view is logged by its page and id alone.
*/

import type { Sheets } from "~/lib/services/google/sheets";
import { isRole, type Label, type Role } from "./labels";
import {
  isPage,
  setArticleCredits,
  setBylines,
  setDifferentPeople,
  setIgnored,
  setLabels,
  writeViews,
  type BylineOn,
  type Page,
  type PrintedElsewhere,
  type StoredView,
  type Unscoped,
  type ViewWrite,
} from "./sheet";

type CreditEntry = { byline: string | null; realName: string };

/* a view's id, as a link names it */
const VIEW_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
/* a declaration is a few hundred characters; a Sheet cell holds 50,000 */
const MOST_VIEW = 8_000;

/** what every change to a page's views carries */
type OnPage = {
  page: Page;
  /** the page's starter views, when the writer's copy was them (./sheet) */
  starter: StoredView[] | null;
};

export type ViewEdit = OnPage &
  (
    | {
        kind: "view-save" | "view-rename";
        id: string;
        view: Record<string, unknown>;
        basedOn: string;
      }
    | {
        kind: "view-create";
        id: string;
        view: Record<string, unknown>;
        position?: number;
      }
    | { kind: "view-delete"; id: string; basedOn: string }
    | { kind: "view-reorder"; order: string[]; basedOn: string[] }
    | { kind: "views-restore" }
  );

export type Edit =
  | {
      kind: "article-credits";
      postId: number;
      role: Role;
      entries: CreditEntry[];
      /** where else the article prints each byline, to split any-role rows */
      elsewhere?: PrintedElsewhere[];
    }
  | {
      kind: "bylines";
      entries: BylineOn[];
      /** rows for no article to remove */
      retire?: Unscoped[];
      /** rows for no article to write back, undoing a retire */
      restore?: Unscoped[];
    }
  | { kind: "labels"; labels: Label[] }
  | { kind: "ignore"; postId: number; ignored: boolean }
  | { kind: "different-people"; names: [string, string]; different: boolean }
  | ViewEdit;

export const isViewEdit = (edit: Edit): edit is ViewEdit =>
  edit.kind.startsWith("view");

/* a declaration as the Views tab keeps it: checked whole by the browser,
   which reads it; here only that it is one, of a size a cell holds */
function storedView(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const view = value as Record<string, unknown>;
  if (view.v !== 1 || "id" in view || "source" in view) return undefined;
  if (typeof view.label !== "string" || !view.label.trim()) return undefined;
  return JSON.stringify(view).length <= MOST_VIEW ? view : undefined;
}

function parseViewEdit(
  b: Record<string, unknown>,
): ViewEdit | { error: string } {
  if (!isPage(b.page)) return { error: "page must be articles or people" };
  const page = b.page;
  let starter: StoredView[] | null = null;
  if (b.starter !== undefined && b.starter !== null) {
    if (!Array.isArray(b.starter) || b.starter.length === 0)
      return { error: "starter must list the page's starter views" };
    starter = [];
    for (const each of b.starter as Record<string, unknown>[]) {
      const view = storedView(each?.view);
      if (typeof each?.id !== "string" || !VIEW_ID.test(each.id) || !view)
        return { error: "every starter view needs an id and a declaration" };
      starter.push({ id: each.id, view });
    }
  }
  const id = typeof b.id === "string" && VIEW_ID.test(b.id) ? b.id : null;
  const basedOn = typeof b.basedOn === "string" ? b.basedOn.trim() : null;
  const view = storedView(b.view);
  const on = { page, starter };

  switch (b.kind) {
    case "view-save":
    case "view-rename":
      if (!id) return { error: "id must be a view's id" };
      if (basedOn === null)
        return { error: "basedOn must be the row's updated at" };
      if (!view)
        return { error: "view must be a declaration, with v 1 and a label" };
      return { ...on, kind: b.kind, id, view, basedOn };
    case "view-create": {
      if (!id) return { error: "id must be a view's id" };
      if (!view)
        return { error: "view must be a declaration, with v 1 and a label" };
      const position = Number(b.position);
      return {
        ...on,
        kind: "view-create",
        id,
        view,
        ...(b.position !== undefined && Number.isFinite(position)
          ? { position }
          : {}),
      };
    }
    case "view-delete":
      if (!id) return { error: "id must be a view's id" };
      if (basedOn === null)
        return { error: "basedOn must be the row's updated at" };
      return { ...on, kind: "view-delete", id, basedOn };
    case "view-reorder": {
      const ids = (v: unknown) =>
        Array.isArray(v) && v.every((x) => typeof x === "string")
          ? (v as string[])
          : null;
      const order = ids(b.order);
      const before = ids(b.basedOn);
      if (!order || !before || order.length === 0)
        return { error: "order and basedOn must list the page's view ids" };
      return { ...on, kind: "view-reorder", order, basedOn: before };
    }
    case "views-restore":
      if (!starter) return { error: "restoring needs the starter views" };
      return { ...on, kind: "views-restore" };
    default:
      return { error: "unknown edit" };
  }
}

/* the Sheet's write for a change to a page's views */
function viewWrite(edit: ViewEdit): ViewWrite {
  switch (edit.kind) {
    case "view-save":
    case "view-rename":
      return {
        kind: edit.kind === "view-save" ? "save" : "rename",
        id: edit.id,
        view: edit.view,
        basedOn: edit.basedOn,
      };
    case "view-create":
      return {
        kind: "create",
        id: edit.id,
        view: edit.view,
        position: edit.position,
      };
    case "view-delete":
      return { kind: "delete", id: edit.id, basedOn: edit.basedOn };
    case "view-reorder":
      return { kind: "reorder", order: edit.order, basedOn: edit.basedOn };
    case "views-restore":
      return { kind: "restore" };
  }
}

/** an edit, or why the request is not one */
export function parseEdit(body: unknown): Edit | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
  const postId = Number(b.postId);
  const validPost = Number.isInteger(postId) && postId > 0;
  const names = (v: unknown) =>
    Array.isArray(v) && v.every((n) => typeof n === "string")
      ? (v as string[]).map((n) => n.trim()).filter(Boolean)
      : undefined;

  if (typeof b.kind === "string" && b.kind.startsWith("view"))
    return parseViewEdit(b);

  switch (b.kind) {
    case "article-credits": {
      if (!validPost) return { error: "postId must be a WordPress post id" };
      if (typeof b.role !== "string" || !isRole(b.role))
        return { error: "role must be writer, image or other" };
      if (!Array.isArray(b.entries)) return { error: "entries must be a list" };
      const entries = (b.entries as Record<string, unknown>[]).map((e) => ({
        byline: text(e?.byline) || null,
        realName: text(e?.realName) ?? "",
      }));
      const elsewhere: PrintedElsewhere[] = [];
      for (const e of (b.elsewhere ?? []) as Record<string, unknown>[]) {
        const byline = text(e?.byline);
        const roles = e?.roles;
        if (
          !byline ||
          !Array.isArray(roles) ||
          !roles.every((r) => typeof r === "string" && isRole(r))
        )
          return { error: "elsewhere must list bylines and their roles" };
        elsewhere.push({ byline, roles: roles as Role[] });
      }
      return {
        kind: "article-credits",
        postId,
        role: b.role,
        entries,
        elsewhere,
      };
    }
    case "bylines": {
      if (!Array.isArray(b.entries)) return { error: "entries must be a list" };
      const entries: BylineOn[] = [];
      for (const e of b.entries as Record<string, unknown>[]) {
        const id = Number(e?.postId);
        const role = e?.role ?? null;
        const byline = text(e?.byline);
        const realNames = names(e?.realNames);
        if (!Number.isInteger(id) || id <= 0)
          return { error: "every entry needs a WordPress post id" };
        if (role !== null && (typeof role !== "string" || !isRole(role)))
          return { error: "role must be writer, image, other or null" };
        if (!byline) return { error: "every entry needs the printed byline" };
        if (!realNames) return { error: "realNames must be a list of names" };
        const note = text(e?.note);
        entries.push({
          postId: id,
          role,
          byline,
          realNames,
          ...(note ? { note } : {}),
        });
      }
      const unscoped = (list: unknown) => {
        const rows: Unscoped[] = [];
        for (const r of (list ?? []) as Record<string, unknown>[]) {
          const byline = text(r?.byline);
          const realName = text(r?.realName);
          const role = r?.role ?? null;
          if (
            !byline ||
            !realName ||
            (role !== null && (typeof role !== "string" || !isRole(role)))
          )
            return undefined;
          rows.push({ byline, role, realName, note: text(r?.note) ?? "" });
        }
        return rows;
      };
      const retire = unscoped(b.retire);
      const restore = unscoped(b.restore);
      if (!retire || !restore)
        return { error: "retire and restore need bylines, names and roles" };
      if (entries.length === 0 && retire.length === 0 && restore.length === 0)
        return { error: "nothing to change" };
      return { kind: "bylines", entries, retire, restore };
    }
    case "labels": {
      if (!Array.isArray(b.labels)) return { error: "labels must be a list" };
      const labels = (b.labels as Record<string, unknown>[]).map((l) => ({
        label: text(l?.label)?.replace(/:$/, "") ?? "",
        role: l?.role,
      }));
      if (
        labels.some(
          (l) => !l.label || typeof l.role !== "string" || !isRole(l.role),
        )
      )
        return { error: "every label needs text and a role" };
      if (labels.length === 0)
        return {
          error: "keep at least one label, or nothing is read as a credit",
        };
      return { kind: "labels", labels: labels as Label[] };
    }
    case "ignore":
      if (!validPost) return { error: "postId must be a WordPress post id" };
      return { kind: "ignore", postId, ignored: b.ignored !== false };
    case "different-people": {
      const names = Array.isArray(b.names) ? b.names.map(text) : [];
      if (names.length !== 2 || names.some((n) => !n))
        return { error: "names must be two names" };
      return {
        kind: "different-people",
        names: names as [string, string],
        different: b.different !== false,
      };
    }
    default:
      return { error: "unknown edit" };
  }
}

/**
 * applies an edit; `who` signs the rows it writes. A change to views returns
 * the `updated at` it wrote, or throws `ViewConflict`
 */
export async function applyEdit(
  sheets: Sheets,
  edit: Edit,
  who: string,
): Promise<string | void> {
  if (isViewEdit(edit))
    return writeViews(sheets, edit.page, viewWrite(edit), {
      starter: edit.starter,
      who,
    });
  const day = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const note = `${who}, ${day}`;
  switch (edit.kind) {
    case "article-credits":
      return setArticleCredits(
        sheets,
        edit.postId,
        edit.role,
        edit.entries,
        edit.elsewhere,
        note,
      );
    case "bylines":
      return setBylines(sheets, edit.entries, edit.retire, edit.restore, note);
    case "labels":
      return setLabels(sheets, edit.labels);
    case "ignore":
      return setIgnored(sheets, edit.postId, edit.ignored, note);
    case "different-people":
      return setDifferentPeople(sheets, edit.names, edit.different, note);
  }
}

/** the log's line for an edit: what kind and where, never whose name */
export function describeEdit(edit: Edit): string {
  switch (edit.kind) {
    case "article-credits":
      return `edited the ${edit.role} contributors of post ${edit.postId}`;
    case "bylines":
      return `set who a byline is on ${edit.entries.length} article row(s)${edit.retire?.length ? `, removing ${edit.retire.length} with no article` : ""}${edit.restore?.length ? `, restoring ${edit.restore.length} with no article` : ""}`;
    case "labels":
      return `saved ${edit.labels.length} credit labels`;
    case "ignore":
      return `${edit.ignored ? "ignored" : "restored"} the problems on post ${edit.postId}`;
    case "different-people":
      return `${edit.different ? "marked" : "unmarked"} two similar names as different people`;
    default:
      return describeViewEdit(edit);
  }
}

function describeViewEdit(edit: ViewEdit): string {
  const starter = edit.starter
    ? `, first writing its ${edit.starter.length} starter views`
    : "";
  switch (edit.kind) {
    case "view-save":
      return `saved view ${edit.id} on ${edit.page}${starter}`;
    case "view-rename":
      return `renamed view ${edit.id} on ${edit.page}${starter}`;
    case "view-create":
      return `added view ${edit.id} on ${edit.page}${starter}`;
    case "view-delete":
      return `deleted view ${edit.id} on ${edit.page}${starter}`;
    case "view-reorder":
      return `moved the views on ${edit.page}${starter}`;
    case "views-restore":
      return `restored the ${edit.starter?.length ?? 0} starter views on ${edit.page}`;
  }
}

/*
  What the signed-in pages may change in the Sheet, checked before anything is
  written. Each edit says how to log itself, and the log line never carries a
  real name: the log is not where the Sheet's secrets go.
*/

import type { Sheets } from "~/lib/services/google/sheets";
import { isRole, type Label, type Role } from "./labels";
import {
  setArticleCredits,
  setBylines,
  setDifferentPeople,
  setIgnored,
  setLabels,
  type BylineOn,
  type PrintedElsewhere,
  type Unscoped,
} from "./sheet";

type CreditEntry = { byline: string | null; realName: string };

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
      /** bylines whose rows for no article to remove */
      retire?: string[];
      /** rows for no article to write back, undoing a retire */
      restore?: Unscoped[];
    }
  | { kind: "labels"; labels: Label[] }
  | { kind: "ignore"; postId: number; ignored: boolean }
  | { kind: "different-people"; names: [string, string]; different: boolean };

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
      const retire = b.retire === undefined ? [] : names(b.retire);
      if (!retire) return { error: "retire must be a list of bylines" };
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
      const restore: Unscoped[] = [];
      for (const r of (b.restore ?? []) as Record<string, unknown>[]) {
        const byline = text(r?.byline);
        const realName = text(r?.realName);
        const role = r?.role ?? null;
        if (
          !byline ||
          !realName ||
          (role !== null && (typeof role !== "string" || !isRole(role)))
        )
          return { error: "restore needs bylines, names and roles" };
        restore.push({ byline, role, realName, note: text(r?.note) ?? "" });
      }
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

/** applies an edit; `who` signs the rows it writes */
export async function applyEdit(sheets: Sheets, edit: Edit, who: string) {
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
  }
}

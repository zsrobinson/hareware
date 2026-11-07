/*
  What the signed-in pages may change in the Sheet, checked before anything is
  written. Each edit says how to log itself, and the log line never carries a
  real name: the log is not where the Sheet's secrets go.
*/

import type { Sheets } from "~/lib/services/google/sheets";
import { isRole, type Label, type Role } from "./labels";
import {
  setArticleCredits,
  setDifferentPeople,
  setIgnored,
  setLabels,
  setByline,
  setPenNames,
} from "./sheet";

type PenNameEntry = { byline: string; realName: string };
type CreditEntry = { byline: string | null; realName: string };
type BylineOn = { postId: number; role: Role | null; realNames: string[] };

export type Edit =
  | { kind: "pen-names"; entries: PenNameEntry[] }
  | {
      kind: "article-credits";
      postId: number;
      role: Role;
      entries: CreditEntry[];
    }
  | {
      kind: "byline";
      byline: string;
      everywhere?: string[];
      articles: BylineOn[];
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

  switch (b.kind) {
    case "pen-names": {
      if (!Array.isArray(b.entries) || b.entries.length === 0)
        return { error: "entries must be a non-empty list" };
      const entries = (b.entries as Record<string, unknown>[]).map((e) => ({
        byline: text(e?.byline),
        realName: text(e?.realName) ?? "",
      }));
      if (entries.some((e) => !e.byline))
        return { error: "every entry needs a byline" };
      return { kind: "pen-names", entries: entries as PenNameEntry[] };
    }
    case "article-credits": {
      if (!validPost) return { error: "postId must be a WordPress post id" };
      if (typeof b.role !== "string" || !isRole(b.role))
        return { error: "role must be writer, image or other" };
      if (!Array.isArray(b.entries)) return { error: "entries must be a list" };
      const entries = (b.entries as Record<string, unknown>[]).map((e) => ({
        byline: text(e?.byline) || null,
        realName: text(e?.realName) ?? "",
      }));
      return { kind: "article-credits", postId, role: b.role, entries };
    }
    case "byline": {
      const byline = text(b.byline);
      if (!byline) return { error: "byline must be the printed name" };
      const names = (v: unknown) =>
        Array.isArray(v) && v.every((n) => typeof n === "string")
          ? (v as string[]).map((n) => n.trim()).filter(Boolean)
          : undefined;
      const everywhere =
        b.everywhere === undefined ? undefined : names(b.everywhere);
      if (b.everywhere !== undefined && !everywhere)
        return { error: "everywhere must be a list of names" };
      if (!Array.isArray(b.articles))
        return { error: "articles must be a list" };
      const articles: BylineOn[] = [];
      for (const a of b.articles as Record<string, unknown>[]) {
        const id = Number(a?.postId);
        const role = a?.role ?? null;
        const realNames = names(a?.realNames);
        if (!Number.isInteger(id) || id <= 0)
          return { error: "every article needs a WordPress post id" };
        if (role !== null && (typeof role !== "string" || !isRole(role)))
          return { error: "role must be writer, image, other or null" };
        if (!realNames) return { error: "realNames must be a list of names" };
        articles.push({ postId: id, role, realNames });
      }
      return { kind: "byline", byline, everywhere, articles };
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
    case "pen-names":
      return setPenNames(sheets, edit.entries, note);
    case "article-credits":
      return setArticleCredits(
        sheets,
        edit.postId,
        edit.role,
        edit.entries,
        note,
      );
    case "byline":
      return setByline(
        sheets,
        edit.byline,
        edit.everywhere,
        edit.articles,
        note,
      );
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
    case "pen-names":
      return `set ${edit.entries.length} pen name row(s)`;
    case "article-credits":
      return `edited the ${edit.role} contributors of post ${edit.postId}`;
    case "byline":
      return `set who a byline is${edit.everywhere ? " everywhere and" : ""} on ${edit.articles.length} article row(s)`;
    case "labels":
      return `saved ${edit.labels.length} credit labels`;
    case "ignore":
      return `${edit.ignored ? "ignored" : "restored"} the problems on post ${edit.postId}`;
    case "different-people":
      return `${edit.different ? "marked" : "unmarked"} two similar names as different people`;
  }
}

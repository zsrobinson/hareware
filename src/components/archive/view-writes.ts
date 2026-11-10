/*
  Every change to a page's views, as the browser makes it: sent to
  /api/sheet with the copy it was based on, then read back through the same
  gated read the page draws from. Only a read that shows the change says
  Saved; a write the Sheet took but the read does not show yet is "not
  confirmed", never saved (docs/agents/silent-failures.md).
*/

import type { QueryClient } from "@tanstack/react-query";
import type { ViewEdit } from "~/lib/credits/edits";
import type { Page, StoredView } from "~/lib/credits/sheet";
import { failureOf, Refused } from "~/lib/gated";
import { readSheetPayload, SHEET_KEY } from "./archive-data";
import { pageViews, storedOf, type PageViews } from "./saved-views";
import type { View } from "./views";

export type Outcome =
  | { status: "saved" }
  /** the Sheet answered, and its read does not show the change yet */
  | { status: "unconfirmed"; recheck: () => Promise<Outcome> }
  /** someone changed the page's views since the copy it was based on */
  | { status: "conflict"; message: string }
  | { status: "failed"; message: string };

/** what the write means, as an edit of a copy of the page's views; null
    when that copy is already as it would make it */
type Change = Omit<ViewEdit, "page" | "starter">;

/**
 * One change, made against whichever copy of the page's views it is given:
 * the one on screen, or after a conflict the Sheet's own, to overwrite it.
 * `holds` says whether a copy read back shows it, given the `updated at`
 * the write answered with.
 */
export type Intent = {
  edit: (copy: PageViews) => Change | null;
  holds: (copy: PageViews, updatedAt: string) => boolean;
};

/* a declaration compared as data, whatever order its keys were written in */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : v,
  );

const sameView = (a: View, b: View) =>
  canonical(storedOf(a)) === canonical(storedOf(b));

const ids = (copy: PageViews) => copy.views.map((saved) => saved.view.id);

/** the view saved as it is now: in place, or, if it has gone, again */
export function saveIntent(
  view: View,
  basedOn: string | null,
  kind: "view-save" | "view-rename" = "view-save",
): Intent {
  return {
    edit: (copy) => {
      const found = copy.views.find((saved) => saved.view.id === view.id);
      const { view: stored } = storedOf(view);
      if (!found)
        return { kind: "view-create", id: view.id, view: stored } as Change;
      return {
        kind,
        id: view.id,
        view: stored,
        /* the copy the editor opened, unless overwriting the Sheet's */
        basedOn: basedOn ?? found.updatedAt,
      } as Change;
    },
    holds: (copy, updatedAt) =>
      copy.views.some(
        (saved) =>
          saved.view.id === view.id &&
          saved.updatedAt === updatedAt &&
          sameView(saved.view, view),
      ),
  };
}

/** a view added after the page's last, or put back where it was */
export function createIntent(view: View, position?: number): Intent {
  return {
    edit: () =>
      ({
        kind: "view-create",
        id: view.id,
        view: storedOf(view).view,
        ...(position === undefined ? {} : { position }),
      }) as Change,
    holds: saveIntent(view, null).holds,
  };
}

export function deleteIntent(id: string, basedOn: string | null): Intent {
  return {
    edit: (copy) => {
      const found = copy.views.find((saved) => saved.view.id === id);
      return found
        ? ({
            kind: "view-delete",
            id,
            basedOn: basedOn ?? found.updatedAt,
          } as Change)
        : null;
    },
    holds: (copy) => !ids(copy).includes(id),
  };
}

/** the page's views in this order; on the Sheet's copy, its own views kept */
export function reorderIntent(order: string[]): Intent {
  const arranged = (copy: PageViews) => {
    const now = ids(copy);
    return [
      ...order.filter((id) => now.includes(id)),
      ...now.filter((id) => !order.includes(id)),
    ];
  };
  let sent = order;
  return {
    edit: (copy) => {
      sent = arranged(copy);
      return { kind: "view-reorder", order: sent, basedOn: ids(copy) };
    },
    holds: (copy) =>
      copy.status === "saved" && ids(copy).join() === sent.join(),
  };
}

/** the page's views replaced by its starter set */
export function restoreIntent(starter: View[]): Intent {
  return {
    edit: () => ({ kind: "views-restore" }),
    holds: (copy) =>
      copy.status === "saved" &&
      copy.views.length === starter.length &&
      copy.views.every((saved, i) => sameView(saved.view, starter[i]!)),
  };
}

/** the Sheet read again, past what the page holds, and what it now says */
async function reread(queryClient: QueryClient, page: Page) {
  const payload = await queryClient.fetchQuery({
    queryKey: SHEET_KEY,
    queryFn: readSheetPayload,
    staleTime: 0,
  });
  return pageViews(payload, page);
}

/**
 * Makes one change to a page's views and reads it back. `copy` is what the
 * change was based on; `starter` the page's starter set, written with the
 * first change to a page that has no rows yet (ADR 0015).
 */
export async function writeViews(
  queryClient: QueryClient,
  page: Page,
  copy: PageViews,
  intent: Intent,
  starter: View[],
): Promise<Outcome> {
  if (copy.status === "unsaved")
    return { status: "failed", message: copy.reason };
  const change = intent.edit(copy);
  if (change === null) return { status: "saved" };
  const written: StoredView[] | null =
    copy.status === "starter" || change.kind === "views-restore"
      ? starter.map(storedOf)
      : null;
  const edit = { ...change, page, starter: written };

  let updatedAt: string | undefined;
  try {
    const response = await fetch("/api/sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edit),
    });
    if (response.status === 409) {
      const body = (await response.json().catch(() => ({}))) as {
        conflict?: string;
      };
      return {
        status: "conflict",
        message: body.conflict ?? "Someone changed this page's views",
      };
    }
    if (!response.ok) {
      const error = await failureOf(response);
      /* the session ended or changed: the page asks the gate again */
      if (error instanceof Refused)
        void queryClient.invalidateQueries({ queryKey: SHEET_KEY });
      return { status: "failed", message: error.message };
    }
    const body = (await response.json().catch(() => ({}))) as {
      updatedAt?: unknown;
    };
    if (typeof body.updatedAt === "string") updatedAt = body.updatedAt;
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  /* an answer without the stamp written cannot be checked for */
  const stamp = updatedAt;
  const check = async (): Promise<Outcome> => {
    try {
      if (
        stamp !== undefined &&
        intent.holds(await reread(queryClient, page), stamp)
      )
        return { status: "saved" };
    } catch {
      /* not read back: not known to be saved */
    }
    return { status: "unconfirmed", recheck: check };
  };
  return check();
}

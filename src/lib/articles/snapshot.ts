/* An Article as the rows a card shows, in plain strings; the presenter draws
   them. */

import { plainText } from "~/lib/services/notion/client";
import { ARTICLE_PROPERTIES } from "./config";
import { propertyOf, type ArticlePage } from "./page";
import { current } from "./write";

// The existing card fields, in the All Articles view's relative order.
const ROWS = [
  "authorByline",
  "status",
  "section",
  "imageStatus",
  "imageByline",
  "publicationDate",
] as const;

export type SnapshotRow = {
  label: string;
  value: string | null;
  /** null when the row is not a status; a status may still have no colour */
  status: { color: string | null } | null;
};

export type ArticleSnapshot = {
  /** may be empty */
  title: string;
  url: string | undefined;
  accentColor: string | null;
  rows: SnapshotRow[];
};

/** Never turn remote text into an arbitrary link posted by the club's bot. */
export function articleUrl(
  page: Pick<ArticlePage, "id" | "url">,
): string | undefined {
  if (page.url) {
    try {
      const url = new URL(page.url);
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        /^(?:www\.|app\.)?notion\.so$|^(?:www\.|app\.)?notion\.com$/.test(
          url.hostname,
        ) &&
        url.href.length <= 512
      )
        return url.href;
    } catch {
      /* not a url; fall back to the page id */
    }
  }
  const id = page.id.replaceAll("-", "");
  return /^[a-f0-9]{32}$/i.test(id) ? `https://www.notion.so/${id}` : undefined;
}

/**
 * The same Article snapshot for show, creation and edits. No reads or writes.
 */
export function snapshot(page: ArticlePage): ArticleSnapshot {
  const rows = ROWS.map((key): SnapshotRow => {
    /* no row is a relation, so the value is text or nothing */
    const text = current(page, key);

    return {
      label: ARTICLE_PROPERTIES[key].name,
      value: typeof text === "string" ? text : null,
      status:
        key === "status" || key === "imageStatus"
          ? { color: propertyOf(page, key)?.status?.color ?? null }
          : null,
    };
  });

  return {
    title: plainText(propertyOf(page, "headline")?.title),
    url: articleUrl(page),
    accentColor: propertyOf(page, "status")?.status?.color ?? null,
    rows,
  };
}

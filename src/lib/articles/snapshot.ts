/*
  an Article flattened to the rows a card shows, and nothing about how to draw
  them.

  this is where notion's property shapes stop. `card()` used to read them
  itself, which put a discord presenter in the business of knowing that a
  `status` carries its label under `status` and a `select` under `select` — and
  made `services/discord` import `services/notion`, one outside system reaching
  into another's adapter. the rows below are plain strings and notion's own
  colour *names*, so the presenter decides what a colour looks like and this
  file decides what an Article says.
*/

import { plainText } from "~/lib/services/notion/client";
import { ARTICLE_PROPERTIES } from "./config";
import { optionName, type ArticlePage } from "./page";

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
  /** the notion property name, which is what the card labels the row with */
  label: string;
  /** the value as text, or null when the property is unset or absent */
  value: string | null;
  /**
   * present only on a status row, and then carrying notion's colour name.
   *
   * a row that *is* a status but arrived without a colour is still a status —
   * hence the nesting rather than a bare `color: string | null`, which would
   * make "not a status" and "a status with no colour" the same thing and drop
   * the marker off the second one
   */
  status: { color: string | null } | null;
};

export type ArticleSnapshot = {
  /** the headline verbatim, which may be empty — naming it is the card's job */
  title: string;
  /** a link safe to put on a button, or undefined when the page has none */
  url: string | undefined;
  /** notion's colour name for Article Status, or null when it is unset */
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
      /* Fall back to the canonical page id. */
    }
  }
  const id = page.id.replaceAll("-", "");
  return /^[a-f0-9]{32}$/i.test(id) ? `https://www.notion.so/${id}` : undefined;
}

/** The same Article snapshot for show, creation and edits. No reads or writes. */
export function snapshot(page: ArticlePage): ArticleSnapshot {
  const property = (key: keyof typeof ARTICLE_PROPERTIES) =>
    page.properties?.[ARTICLE_PROPERTIES[key].name];

  const rows = ROWS.map((key): SnapshotRow => {
    const value = property(key);
    const text =
      key === "publicationDate"
        ? (value?.date?.start ?? null)
        : key === "authorByline" || key === "imageByline"
          ? plainText(value?.rich_text) || null
          : optionName(value);

    return {
      label: ARTICLE_PROPERTIES[key].name,
      value: text,
      status:
        key === "status" || key === "imageStatus"
          ? { color: value?.status?.color ?? null }
          : null,
    };
  });

  return {
    title: plainText(property("headline")?.title),
    url: articleUrl(page),
    accentColor: property("status")?.status?.color ?? null,
    rows,
  };
}

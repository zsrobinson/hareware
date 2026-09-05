/*
  what an Article looks like when notion hands one over.

  pure functions over a page object, because this is where the bugs are. every
  property is optional in practice — a page often exists with nothing but a
  Headline while somebody is still typing it — and `Article Status` is a
  `status` where `Section` is a `select`, two different shapes carrying the same
  word. see ADR 0009.
*/

import { plainText } from "~/lib/services/notion/client";
import { ARTICLE_PROPERTIES, UNTITLED } from "./config";

/**
 * a property value, in every shape we read.
 *
 * wider than the client's `NotionProperty` because the client describes what
 * the meeting reminder needs; an Article carries statuses, selects and
 * relations too. every field is optional and nullable on purpose — notion
 * sends `null`, not an absent key, for an empty one
 */
export type ArticleProperty = {
  type?: string;
  title?: { plain_text: string }[] | null;
  rich_text?: { plain_text: string }[] | null;
  date?: { start?: string | null } | null;
  status?: { name?: string | null; color?: string | null } | null;
  select?: { name?: string | null; color?: string | null } | null;
  relation?: { id: string }[] | null;
};

/** a page as the Articles data source returns it */
export type ArticlePage = {
  id: string;
  url?: string;
  last_edited_time?: string;
  /* notion's two words for the same thing, depending on endpoint age */
  in_trash?: boolean;
  archived?: boolean;
  properties: Record<string, ArticleProperty>;
};

/*
  older than anything notion can return, so a page that arrived without a
  timestamp sorts last rather than first — a missing clock should not put an
  Article at the top of the picker
*/
const NO_TIMESTAMP = "1970-01-01T00:00:00.000Z";

/**
 * the chosen option's name, whichever of the two shapes it arrived in.
 *
 * a `status` carries it under `status` and a `select` under `select`. read
 * tolerantly here because the picker only wants the label, and a property
 * somebody converted from one to the other in notion should show its value
 * rather than go blank until the code catches up. writes are the opposite and
 * have to know which they are talking to
 */
export function optionName(property: ArticleProperty | undefined) {
  return property?.status?.name ?? property?.select?.name ?? null;
}

/** notion's id of every related page, or `[]` — see `assertProperties` */
export function relationIds(property: ArticleProperty | undefined) {
  return (property?.relation ?? []).map((related) => related.id);
}

/** Whether Notion returned values that can confirm the named properties. */
export function readableProperties(
  page: ArticlePage,
  properties: (keyof typeof ARTICLE_PROPERTIES)[],
): boolean {
  return properties.every((property) => {
    const { name, type } = ARTICLE_PROPERTIES[property];
    const value = page.properties?.[name];
    if (!value || !Object.hasOwn(value, type)) return false;
    switch (type) {
      case "title":
        return (
          Array.isArray(value.title) &&
          value.title.every((text) => typeof text.plain_text === "string")
        );
      case "rich_text":
        return (
          Array.isArray(value.rich_text) &&
          value.rich_text.every((text) => typeof text.plain_text === "string")
        );
      case "relation":
        return (
          Array.isArray(value.relation) &&
          value.relation.every((related) => typeof related.id === "string")
        );
      case "date":
        return value.date === null || typeof value.date?.start === "string";
      case "status":
        return value.status === null || typeof value.status?.name === "string";
      case "select":
        return value.select === null || typeof value.select?.name === "string";
    }
  });
}

/**
 * an Article, flattened to what the picker and the card need.
 *
 * everything is read off the page rather than out of a store, so this is the
 * only shape either of them ever sees
 */
export type Article = {
  pageId: string;
  headline: string;
  lastEdited: string;
  section: string | null;
  status: string | null;
  imageStatus: string | null;
  authorByline: string | null;
  publicationDate: string | null;
};

/** a notion page as an Article */
export function toArticle(page: ArticlePage): Article {
  const property = (key: keyof typeof ARTICLE_PROPERTIES) =>
    page.properties?.[ARTICLE_PROPERTIES[key].name];

  const headline = plainText(property("headline")?.title).trim();
  const byline = plainText(property("authorByline")?.rich_text).trim();

  return {
    pageId: page.id,
    headline: headline || UNTITLED,
    lastEdited: page.last_edited_time ?? NO_TIMESTAMP,
    section: optionName(property("section")),
    status: optionName(property("status")),
    imageStatus: optionName(property("imageStatus")),
    authorByline: byline || null,
    publicationDate: property("publicationDate")?.date?.start ?? null,
  };
}

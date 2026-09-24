/* An Article page as Notion returns it. Any property may be missing. */

import { inDataSource, plainText } from "~/lib/services/notion/client";
import {
  ARTICLE_PROPERTIES,
  ARTICLES_DATA_SOURCE_ID,
  UNTITLED,
} from "./config";

/** a property value in every shape we read; Notion sends `null` for empty */
export type ArticleProperty = {
  type?: string;
  title?: { plain_text: string }[] | null;
  rich_text?: { plain_text: string }[] | null;
  date?: { start?: string | null } | null;
  status?: { name?: string | null; color?: string | null } | null;
  select?: { name?: string | null; color?: string | null } | null;
  relation?: { id: string }[] | null;
};

export type ArticlePage = {
  id: string;
  url?: string;
  last_edited_time?: string;
  /* notion's two words for the same thing, depending on endpoint age */
  in_trash?: boolean;
  archived?: boolean;
  parent?: { type?: string; data_source_id?: string };
  properties: Record<string, ArticleProperty>;
};

const NOTION_ID =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/**
 * The text as a page id, or null. It goes into a Notion url path, so `../` must
 * not.
 */
export function pageIdOf(text: string): string | null {
  return NOTION_ID.test(text) ? text : null;
}

/** Whether the page is a row of Articles, not any page the token can reach. */
export function isArticle(page: ArticlePage): boolean {
  return inDataSource(page, ARTICLES_DATA_SOURCE_ID);
}

/* so a page without a timestamp sorts last */
const NO_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function propertyOf(
  page: ArticlePage,
  key: keyof typeof ARTICLE_PROPERTIES,
): ArticleProperty | undefined {
  return page.properties?.[ARTICLE_PROPERTIES[key].name];
}

/** the chosen option's name, from a `status` or a `select` alike */
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

/** an Article, as the picker needs it */
export type Article = {
  pageId: string;
  headline: string;
  lastEdited: string;
};

export function toArticle(page: ArticlePage): Article {
  const headline = plainText(propertyOf(page, "headline")?.title).trim();

  return {
    pageId: page.id,
    headline: headline || UNTITLED,
    lastEdited: page.last_edited_time ?? NO_TIMESTAMP,
  };
}

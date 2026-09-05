/*
  one Article, as `/article show` renders it.

  read live from notion and never from the index: ADR 0009 makes the index
  serve autocomplete and nothing else, so what an editor is *shown* has to come
  from the page itself or a minute-old label becomes a fact somebody acts on.

  a pure function over the page object, so the rendering is testable without a
  request — and rendering is where the bugs are. every property on an Article
  is optional, and notion sends `null` rather than omitting the key, so a
  property that is legitimately empty and one the integration cannot see arrive
  looking the same. an empty one loses its line here rather than printing
  "undefined".
*/

import { notion } from "~/lib/services/notion/client";
import { ARTICLE_PROPERTIES, UNTITLED } from "./config";
import { optionName, type ArticlePage } from "./sync";

/**
 * the page a card renders.
 *
 * `ArticlePage` plus notion's `url`, which the query path does not read and
 * this one does — the whole point of the card is a way back into notion
 */
export type CardPage = ArticlePage & { url?: string };

/**
 * the Article as ephemeral discord markdown.
 *
 * the labels are notion's property names verbatim, per ADR 0009: the club
 * renames a thing once, and an editor reading the card is reading the same
 * words they will see in notion
 */
export function card(page: CardPage): string {
  const property = (key: keyof typeof ARTICLE_PROPERTIES) =>
    page.properties?.[ARTICLE_PROPERTIES[key].name];

  const headline = text(property("headline")?.title) || UNTITLED;

  const lines = [
    `**${headline}**`,
    line(ARTICLE_PROPERTIES.status.name, optionName(property("status"))),
    line(
      ARTICLE_PROPERTIES.imageStatus.name,
      optionName(property("imageStatus")),
    ),
    line(ARTICLE_PROPERTIES.section.name, optionName(property("section"))),
    line(
      ARTICLE_PROPERTIES.authorByline.name,
      text(property("authorByline")?.rich_text),
    ),
    line(
      ARTICLE_PROPERTIES.imageByline.name,
      text(property("imageByline")?.rich_text),
    ),
    line(
      ARTICLE_PROPERTIES.publicationDate.name,
      property("publicationDate")?.date?.start,
    ),
    /* a page notion returned without a url is a shape we did not expect, and a
       link to nowhere is worse than no link */
    page.url ? `[Open in Notion](${page.url})` : undefined,
  ];

  return lines.filter(Boolean).join("\n");
}

/** one labelled line, or nothing at all when the property is empty */
function line(label: string, value: string | null | undefined) {
  return value ? `${label}: ${value}` : undefined;
}

/** the plain text of a title or rich text property, blank when it is empty */
function text(parts: { plain_text: string }[] | null | undefined): string {
  return (parts ?? [])
    .map((part) => part.plain_text)
    .join("")
    .trim();
}

/**
 * one Article, read live from notion.
 *
 * separate from `card` so the rendering stays a pure function: this is the
 * only part that cannot be tested without a request, and it is four lines
 */
export async function readArticle(
  pageId: string,
  token: string,
): Promise<CardPage> {
  return (await notion(`pages/${pageId}`, token)) as CardPage;
}

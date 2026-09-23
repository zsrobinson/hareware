/*
  The picker's Articles, read live from Notion — no cache but a ten-second
  memo, which keeps a burst of keystrokes inside Notion's ~3 requests a second.
  ADR 0009 has the measurements.
*/

import { notion } from "~/lib/services/notion/client";
import { ARTICLES_DATA_SOURCE_ID, ARTICLE_PROPERTIES } from "./config";
import { toArticle, type Article, type ArticlePage } from "./page";

/** one request's worth; older work is found by `search` */
const RECENT = 100;

/** long enough to cover a burst of typing and no more */
const FRESH_MS = 10_000;

/** per isolate and shared by everyone it serves: the list is not per-person */
let snapshot: { articles: Article[]; at: number } | undefined;

/** for tests, which must not share a snapshot */
export function forget() {
  snapshot = undefined;
}

async function query(body: Record<string, unknown>, token: string) {
  const response = (await notion(
    `data_sources/${ARTICLES_DATA_SOURCE_ID}/query`,
    token,
    body,
  )) as { results: ArticlePage[] };

  return response.results.map(toArticle);
}

/**
 * the most recently edited Articles. Throws; the caller races it against a
 * deadline.
 */
export async function recentArticles(token: string): Promise<Article[]> {
  if (snapshot && Date.now() - snapshot.at < FRESH_MS) return snapshot.articles;

  const articles = await query(
    {
      page_size: RECENT,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    },
    token,
  );

  snapshot = { articles, at: Date.now() };

  return articles;
}

/**
 * Articles whose Headline contains this text, by Notion's literal (not fuzzy)
 * match
 */
export async function search(token: string, text: string): Promise<Article[]> {
  return query(
    {
      page_size: RECENT,
      filter: {
        property: ARTICLE_PROPERTIES.headline.name,
        title: { contains: text },
      },
    },
    token,
  );
}

export async function readArticle(
  token: string,
  pageId: string,
): Promise<ArticlePage> {
  return (await notion(`pages/${pageId}`, token)) as ArticlePage;
}

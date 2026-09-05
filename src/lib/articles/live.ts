/*
  the picker, read from notion rather than from a copy of it.

  there was an index in D1 behind this, kept current by a webhook, a
  write-through and an hourly rebuild. it was deleted, and what it cost is
  worth writing down: three writers into one table needed a version guard, the
  guard discarded a second edit made in the same minute as the first, and an
  editor renaming a Headline watched discord hold the old one. a cache fed by
  webhooks is never "immediately" — notion documents delivery as most within a
  minute and up to five, and measured here it was nine seconds once and
  sixty-five the next.

  so notion is the source of truth and this reads it. the measurements the
  shape rests on:

    100 most recent, sorted   1 request   ~0.7s, one 2.0s outlier
    the whole corpus          2 requests  ~1.2s, and growing every year
    a `contains` search       1 request   ~0.5s
    discord's deadline                     3.0s, hard, cannot be deferred
    notion's budget                        ~3 requests a second

  the memo below is what makes that budget work. see ADR 0009 for the
  assumptions it rests on.
*/

import { notion } from "~/lib/services/notion/client";
import { ARTICLES_DATA_SOURCE_ID, ARTICLE_PROPERTIES } from "./config";
import { toArticle, type Article, type ArticlePage } from "./page";

/**
 * how many of the most recently edited Articles one read pulls.
 *
 * a hundred is one request where the whole corpus is two and climbing — and
 * sorted by recency it is the hundred anybody is plausibly reaching for. the
 * tail this cannot see is older work, which `search` below still finds
 */
const RECENT = 100;

/**
 * how long a snapshot is reused.
 *
 * short on purpose. this exists so that six keystrokes are one notion request
 * rather than six — at roughly three requests a second, two editors typing at
 * once would otherwise be refused — and not to make anything faster. ten
 * seconds covers a burst of typing and little else, which is the point: the
 * next time somebody opens the picker they get notion, not this
 */
const FRESH_MS = 10_000;

/**
 * the last snapshot, held in the isolate.
 *
 * module scope rather than a store, because this is a cache of one upstream
 * read and nothing durable. cloudflare keeps an isolate warm between requests,
 * so the keystrokes of one editor typing almost always share it — and when
 * they do not, the cost is one extra read. it can never be wrong, only absent.
 *
 * shared between everybody the isolate serves, which is safe here: the list is
 * not per-person, and the editorial board check runs before anything reaches
 * this
 */
let snapshot: { articles: Article[]; at: number } | undefined;

/** the isolate's memory, emptied — for tests, which must not share one */
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
 * the most recently edited Articles, from notion or from the last few seconds
 * of it.
 *
 * throws are the caller's to handle: it races this against discord's deadline
 * and has a worse answer it would rather give than none
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
 * Articles whose Headline contains this text, for the ones too old to be in
 * the hundred above.
 *
 * notion's `contains` is a literal substring match: it finds "ellicott" and
 * "Ellicott Hall", and does not find "elicott", "hall ellicott" or "stolen
 * card". so this is a stop-gap and reads like one — the fuzzy matching an
 * editor gets on recent work is the local one, and this is the coarser net for
 * something half-remembered from years ago.
 *
 * ADR 0009 records what would replace it
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

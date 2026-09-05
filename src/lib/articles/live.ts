/*
  the picker, read straight from notion.

  the index exists because autocomplete fires on every keystroke and notion
  allows about three requests a second — so a cache is what stops two editors
  typing at once from exhausting the budget. it is not what makes the picker
  *correct*, and it was never meant to be the thing an editor waits on.

  measured, the numbers that decide this shape:

    a whole-table read   139 rows, 2 requests, ~1.2s
    the 100 most recent    1 request,          ~0.7s, with a 2.0s outlier
    discord's deadline                          3.0s, hard, cannot be deferred
    notion's budget                             ~3 requests a second
    a webhook                                   9s once, 65s the next time

  so: one request, sorted by recency, and the index behind it for when that
  request is slow or refused. live when it can be, a minute stale at worst,
  never an empty dropdown.
*/

import { notion } from "~/lib/services/notion/client";
import type { ArticleRow } from "~/lib/db/schema";
import { ARTICLES_DATA_SOURCE_ID } from "./config";
import { toEntry, type ArticlePage } from "./sync";

/**
 * how many rows one live read pulls.
 *
 * a hundred is one request rather than two, and sorted by recency it is the
 * hundred anybody is plausibly reaching for — of the club's most recent
 * hundred, eleven are still in flight and the rest are published. the tail this
 * cannot see is the oldest published work, which the index still answers for
 */
const LIVE_ROWS = 100;

/**
 * the most recently edited Articles, live.
 *
 * sorted by notion rather than by us, so the one request is the right hundred.
 * throws are the caller's to handle — it races this against a deadline and has
 * somewhere better to fall back to
 */
export async function liveRows(token: string): Promise<ArticleRow[]> {
  const response = (await notion(
    `data_sources/${ARTICLES_DATA_SOURCE_ID}/query`,
    token,
    {
      page_size: LIVE_ROWS,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    },
  )) as { results: ArticlePage[] };

  /* `syncedAt` is the index's own bookkeeping and means nothing here: these
     rows were read this second and are not going into any table. the nulls are
     the same widening — `toEntry` leaves a property it did not find undefined,
     and a row read out of d1 has it null */
  return response.results.map((page) => {
    const entry = toEntry(page);

    return {
      ...entry,
      section: entry.section ?? null,
      status: entry.status ?? null,
      imageStatus: entry.imageStatus ?? null,
      authorByline: entry.authorByline ?? null,
      publicationDate: entry.publicationDate ?? null,
      syncedAt: 0,
    };
  });
}

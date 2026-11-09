/*
  How often each article was read, by Jetpack's count, merged onto an archive
  built without it: views come from a gated read of their own, slower than
  WordPress's and able to fail on its own (~/lib/services/wordpress/stats).

  Views that could not be read are unavailable, never zero. Zero is an answer:
  an article Jetpack's answer leaves out was read by nobody, but only if it
  was published before that answer was asked for. Its end is no proof: an
  article published while the answer was on its way is in the archive and
  not in the count.
*/

import type { PostViews } from "~/lib/services/wordpress/stats";
import type { Archive, ArchiveArticle } from "./archive";

/* the browser's clock and WordPress's need not agree, so an article this
   close to the ask is unavailable for a while rather than wrongly zero */
const CLOCKS_MS = 10 * 60_000;

export type ArticleViews =
  /** not read, not readable, or the article is newer than the ask */
  | { status: "unavailable" }
  | {
      status: "counted";
      total: number;
      /** by `YYYY-MM`, in the site's own time; a month with none is left out */
      byMonth: Record<string, number>;
    };

export type ViewsSummary =
  | { status: "reading" }
  | { status: "unavailable"; reason: string }
  | { status: "read"; fetchedAt: string };

/** what the read of views came to */
export type ViewsRead =
  | { status: "unavailable"; reason: string }
  | {
      status: "read";
      posts: PostViews;
      /** when it was asked for, on the browser's clock */
      askedAt: string;
      /** when the answer was read, for its age */
      fetchedAt: string;
    };

export function withViews(archive: Archive, read: ViewsRead): Archive {
  if (read.status === "unavailable")
    return {
      ...archive,
      views: read,
      articles: archive.articles.map((article) => ({
        ...article,
        views: { status: "unavailable" },
      })),
    };

  const countedBefore = Date.parse(read.askedAt) - CLOCKS_MS;
  return {
    ...archive,
    views: { status: "read", fetchedAt: read.fetchedAt },
    articles: archive.articles.map((article) => {
      const byMonth = read.posts[article.id];
      /* NaN, from a missing or unreadable time, compares false: so not
         `< countedBefore` */
      if (!byMonth && !(Date.parse(article.publishedAt) < countedBefore))
        return { ...article, views: { status: "unavailable" } };
      return {
        ...article,
        views: {
          status: "counted",
          total: Object.values(byMonth ?? {}).reduce((a, b) => a + b, 0),
          byMonth: byMonth ?? {},
        },
      };
    }),
  };
}

/* an answer this thin is likelier short than true: on 2026-11-09 Jetpack's
   counted every one of the site's 419 posts, so a month-old article read by
   nobody is rare, and many of them is a count that left some out */
const SETTLED_MS = 30 * 24 * 60 * 60_000;
const THIN_AT_LEAST = 3;
const THIN_SHARE = 0.1;

/**
 * Whether a count of views on these articles looks short: how many of those
 * published over a month before the read have no recorded views, of how
 * many, once that is at least three and a tenth of them; else null. Zero is
 * what Jetpack answered for them, so it is still drawn, and this is said
 * under it rather than in its place
 */
export function thinViews(
  articles: readonly Pick<ArchiveArticle, "publishedAt" | "views">[],
  summary: ViewsSummary,
): { none: number; of: number } | null {
  if (summary.status !== "read") return null;
  const settled = Date.parse(summary.fetchedAt) - SETTLED_MS;
  let of = 0;
  let none = 0;
  for (const { publishedAt, views } of articles) {
    if (views.status !== "counted" || !(Date.parse(publishedAt) < settled))
      continue;
    of++;
    if (views.total === 0) none++;
  }
  return none >= THIN_AT_LEAST && none >= of * THIN_SHARE ? { none, of } : null;
}

/** "14 of 32 articles have no recorded views; Jetpack may have left some out." */
export const thinText = ({ none, of }: { none: number; of: number }) =>
  `${none} of ${of} articles have no recorded views; Jetpack may have left some out.`;

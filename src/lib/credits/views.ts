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
import type { Archive } from "./archive";

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

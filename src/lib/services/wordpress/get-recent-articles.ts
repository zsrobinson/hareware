/*
  The newest articles, ten to a page, for the Instagram Posts landing. Read from
  the REST API in the browser: the RSS feed it used to read sends no CORS
  headers, and the API also says how many pages there are.
*/

import { recentUrl } from "./urls";
import { readWordPress } from "./request";
import { scrubFragment } from "./scrub-html";

export type RecentArticle = {
  /** html, scrubbed */
  title: string;
  link: string;
  /** "Nov 6", in the site's own time zone */
  date: string;
};

export async function getRecentArticles(
  page = 1,
): Promise<{ articles: RecentArticle[]; pages: number }> {
  const res = await readWordPress(recentUrl(page), "the recent articles");
  /* past the last page, WordPress answers 400 rather than an empty list */
  if (res.status === 400) return { articles: [], pages: 0 };
  if (!res.ok) throw new Error(`wordpress answered ${res.status}`);

  const rows = (await res.json()) as {
    title: { rendered: string };
    link: string;
    date: string;
  }[];
  const pages = Number(res.headers.get("x-wp-totalpages"));

  return {
    articles: rows.map((row) => ({
      title: scrubFragment(row.title.rendered),
      link: row.link,
      /* `date` is the site's local time with no offset, so it is read as utc
         and printed as utc, which leaves the day as WordPress wrote it */
      date: new Date(`${row.date}Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    })),
    pages: Number.isFinite(pages) && pages > 0 ? pages : page,
  };
}

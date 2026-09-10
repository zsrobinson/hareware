/*
  the Articles the club has scheduled, in the order they publish.

  two notion reads rather than one: the schema is asked what it calls the
  Scheduled status before the data source is asked which Articles hold it. ADR
  0009 forbids typing a notion value into this repo and a status filter is
  where that bites hardest — `Scheduled` against an option notion spells
  differently matches nothing, returns `200`, and reads as an empty schedule.
*/

import { notion } from "~/lib/services/notion/client";
import { fetchSchema, optionNamed } from "./choices";
import { ARTICLES_DATA_SOURCE_ID, ARTICLE_PROPERTIES } from "./config";
import { toArticle, type Article, type ArticlePage } from "./page";

/** casefolded, because the schema spells it back — see `optionNamed` */
export const SCHEDULED = "scheduled";

/** the club has never had a tenth of this scheduled at once */
const PAGE_SIZE = 100;

/**
 * the schedule, or the fact that notion can no longer describe one.
 *
 * a renamed or deleted Scheduled option and an empty schedule are different
 * facts, and an empty list says both — so the first is a state of its own
 * rather than a `[]` that would answer "nothing is scheduled" forever
 */
export type Upcoming =
  | {
      outcome: "scheduled";
      /** notion's own spelling of the status these were read by */
      status: string;
      articles: Article[];
      /** notion held more than one query returns, so the tail is missing */
      truncated: boolean;
    }
  | { outcome: "no-such-status" };

/**
 * the day an Article publishes, or `null` when it carries no date.
 *
 * notion writes a date-only property as a bare `YYYY-MM-DD` and a dated one as
 * an instant with an offset, so the day is the first ten characters of either
 * and never the result of parsing one — see `docs/agents/silent-failures.md`,
 * where running a bare date through a timezone lands it the evening before
 */
export function publicationDay(article: Article): string | null {
  const start = article.publicationDate;

  return start && /^\d{4}-\d{2}-\d{2}/.test(start) ? start.slice(0, 10) : null;
}

/**
 * scheduled Articles by the day they publish, undated last.
 *
 * sorted here rather than by notion: an Article can be Scheduled with no
 * Publication Date, and where notion places those in an ordered query is not
 * something anybody here has gone and checked. one rule, written once, and
 * exercised without a token
 */
export function inPublicationOrder(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => {
    const day = publicationDay(a);
    const other = publicationDay(b);

    if (day === other) return a.headline.localeCompare(b.headline);
    if (!day) return 1;
    if (!other) return -1;

    return day.localeCompare(other);
  });
}

/**
 * every scheduled Article, read live from notion.
 *
 * throws are the caller's to handle, as everywhere else Articles are read: it
 * is the one that knows what to say to an editor who is waiting
 */
export async function upcomingArticles(token: string): Promise<Upcoming> {
  const status = optionNamed(
    await fetchSchema(token),
    ARTICLE_PROPERTIES.status.name,
    SCHEDULED,
  );
  if (!status) return { outcome: "no-such-status" };

  const response = (await notion(
    `data_sources/${ARTICLES_DATA_SOURCE_ID}/query`,
    token,
    {
      page_size: PAGE_SIZE,
      filter: {
        property: ARTICLE_PROPERTIES.status.name,
        status: { equals: status },
      },
    },
  )) as { results: ArticlePage[]; has_more?: boolean };

  return {
    outcome: "scheduled",
    status,
    articles: inPublicationOrder(response.results.map(toArticle)),
    truncated: response.has_more === true,
  };
}

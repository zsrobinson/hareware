/*
  the tail of the pipeline: the Articles that are edited, waiting, or dated.

  the status names are resolved from the schema before anything is queried by
  them. ADR 0009 forbids typing a notion value into this repo and a status
  filter is where that bites hardest — a status spelled differently here
  matches nothing, returns `200`, and reads as an empty section.
*/

import { fetchSchema, optionNamed } from "./choices";
import { ARTICLE_PROPERTIES } from "./config";
import { queryArticles } from "./live";
import type { Article } from "./page";

/**
 * the three statuses this lists, latest first.
 *
 * casefolded, because the schema spells them back — see `optionNamed`. the
 * order is the order the sections appear in: an editor reads down from what is
 * closest to going out
 */
export const UPCOMING_STATUSES = [
  "scheduled",
  "managing edited",
  "section edited",
] as const;

/** the club has never had a tenth of this in the pipeline at once */
const PAGE_SIZE = 100;

/** one section of the reply: a status, and the Articles holding it */
export type UpcomingGroup = {
  /** notion's own spelling, which is what the heading says */
  status: string;
  articles: Article[];
};

export type Upcoming = {
  /** only the statuses notion still has, in `UPCOMING_STATUSES` order */
  groups: UpcomingGroup[];
  /**
   * the statuses notion no longer has, as this file asked for them.
   *
   * a renamed status and a status nothing holds are different facts, and an
   * empty group says both — so a section that cannot be looked up at all is
   * named rather than quietly dropped, which would read as "nothing is
   * scheduled" for as long as nobody noticed
   */
  missing: string[];
  /** notion held more than one query returns, so the tail is missing */
  truncated: boolean;
};

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
 * Articles by the day they publish, undated last.
 *
 * sorted here rather than by notion: an Article can hold any of these statuses
 * with no Publication Date, and where notion places those in an ordered query
 * is not something anybody here has gone and checked. one rule, written once,
 * and exercised without a token
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
 * every Article in the last three stages, read live from notion.
 *
 * throws are the caller's to handle, as everywhere else Articles are read: it
 * is the one that knows what to say to an editor who is waiting
 */
export async function upcomingArticles(token: string): Promise<Upcoming> {
  const schema = await fetchSchema(token);

  const wanted = UPCOMING_STATUSES.map((status) => ({
    asked: status,
    name: optionNamed(schema, ARTICLE_PROPERTIES.status.name, status),
  }));

  const found = wanted.filter((status) => status.name !== null);
  const missing = wanted
    .filter((status) => status.name === null)
    .map((status) => status.asked);

  /* nothing left to filter on, so there is nothing to ask notion for */
  if (found.length === 0) return { groups: [], missing, truncated: false };

  const { articles, hasMore } = await queryArticles(token, {
    page_size: PAGE_SIZE,
    filter: {
      or: found.map((status) => ({
        property: ARTICLE_PROPERTIES.status.name,
        status: { equals: status.name },
      })),
    },
  });

  return {
    groups: found.map((status) => ({
      status: status.name!,
      articles: inPublicationOrder(
        articles.filter((article) => article.status === status.name),
      ),
    })),
    missing,
    truncated: hasMore,
  };
}

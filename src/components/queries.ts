/*
  What the islands read, as TanStack query options, against the one client in
  ~/lib/query-client. Each first read takes the request the page's inline
  script already sent (~/lib/early, through readWordPress), and anything read
  once is there for the next page: back to the list, or from the slides to
  InDesign Export for the same article.
*/

import { queryOptions } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { ReminderView } from "~/lib/reminder-view";
import { toArticleLink } from "~/lib/services/wordpress/article-url";
import { getRecentArticles } from "~/lib/services/wordpress/get-recent-articles";
import {
  recentArticles,
  scrapeArticle,
} from "~/lib/services/wordpress/scrape-article";
import { fetchGated } from "./gated";

/* WordPress changes when someone publishes, a few times a day */
const ARTICLES_FRESH_MS = 5 * 60_000;

/** the recent list on Instagram Posts, one page of it */
export const recentQuery = (page: number) =>
  queryOptions({
    queryKey: ["recent", page],
    queryFn: () => getRecentArticles(page),
    staleTime: ARTICLES_FRESH_MS,
  });

/** one article, read and scrubbed, by its slug */
export const articleQuery = (slug: string) =>
  queryOptions({
    queryKey: ["article", slug],
    queryFn: () => scrapeArticle(toArticleLink(slug) ?? slug),
    staleTime: ARTICLES_FRESH_MS,
    /* the body is DOM elements, which are kept as they are */
    structuralSharing: false,
  });

/** the newsletter's latest articles */
export const latestQuery = queryOptions({
  queryKey: ["latest", 10],
  queryFn: () => recentArticles(10),
  staleTime: ARTICLES_FRESH_MS,
});

/** the Social Reminder's log and next run, behind the gate */
export const reminderQuery = queryOptions({
  queryKey: ["reminder"],
  queryFn: () => fetchGated<ReminderView>("/api/reminder.json"),
  staleTime: 30_000,
});

const noSubscription = () => () => {};
/**
 * false while hydrating, then true. A page drawn at build time shows its
 * loading line; something already in memory, as after moving between pages,
 * is drawn just after hydration rather than in it, so the two agree
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/*
  The article a tool's address names, for Instagram Posts and InDesign Export:
  `?article=` read once, the article read through the shared client (so one
  read serves both tools), and the address rewritten to the short `?article=
  slug` form once it is found. Both islands are client-only, so the address
  is there on the first render.
*/

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { queryClient } from "~/lib/query-client";
import {
  toArticleLink,
  toArticleSlug,
} from "~/lib/services/wordpress/article-url";
import { Throttled } from "~/lib/services/wordpress/request";
import { articleQuery } from "./queries";

export const NOT_OURS =
  "That isn't a link to a Hare article. It should start with theumdhare.com.";

/** why an article couldn't be shown, in the words the pages use */
function articleError(error: unknown): string {
  return error instanceof Throttled
    ? "WordPress is busy right now. Try again in a minute."
    : "That article couldn't be read. Check the link, and that it's published.";
}

export function useArticleFromAddress() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const typed = params.get("article") ?? "";
  const link = typed ? toArticleLink(typed) : undefined;
  const slug = link && toArticleSlug(link);

  const query = useQuery(
    { ...articleQuery(slug ?? ""), enabled: Boolean(slug) },
    queryClient,
  );

  useEffect(() => {
    if (query.error) console.error("could not read the article", query.error);
  }, [query.error]);

  /* the address names the article the short way, as it always has */
  useEffect(() => {
    if (!query.data || !slug) return;
    const url = new URL(window.location.href);
    url.searchParams.set("article", slug);
    window.history.replaceState(window.history.state, "", url);
  }, [query.data, slug]);

  return {
    params,
    typed,
    link,
    /** waiting on the article the address names */
    reading: Boolean(slug) && query.isPending,
    article: query.data,
    /** the address's own problem, or the read's, in words */
    error:
      typed && !link
        ? NOT_OURS
        : query.error
          ? articleError(query.error)
          : null,
  };
}

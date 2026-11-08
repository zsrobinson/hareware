/*
  Instagram Posts, read in the browser (ADR 0012). The page is a static file;
  this reads `?article=` and `?page=` off the address and asks WordPress for the
  article or the recent list itself.
*/

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { createElement, useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "~/lib/query-client";
import { cn } from "~/lib/utils";
import { toArticleSlug } from "~/lib/services/wordpress/article-url";
import {
  SLIDE_IMAGE_WIDTH,
  toSizedImage,
} from "~/lib/services/wordpress/image-url";
import { pageOf } from "~/lib/services/wordpress/urls";
import { ArticleLink } from "./article-link";
import { GeneratePage } from "./generate-page";
import { articleQuery, recentQuery } from "./queries";
import { couldNotRead, ReadFailed, Reading } from "./read-state";
import { buttonVariants } from "./ui/button";
import { useArticleFromAddress } from "./use-article";

/** the article's body elements as react ones, so the content slide can
    show and hide them one by one */
function bodyNodes(body: Element[]): ReactNode[] {
  return body.map((element, index) =>
    createElement(element.tagName.toLowerCase(), {
      key: index,
      /* scrubbed when the article was read */
      dangerouslySetInnerHTML: { __html: element.innerHTML },
    }),
  );
}

export function InstagramPosts() {
  const { params, typed, reading, article, error } = useArticleFromAddress();
  const bar = (
    <ArticleLink
      action="/generate"
      verb="Make slides"
      typed={typed}
      link={article?.link}
      error={error}
    />
  );

  if (article)
    return (
      <GeneratePage
        defaultTitle={article.title}
        defaultArticleByline={article.author ?? ""}
        defaultImageByline={article.imageCredits ?? ""}
        imageURI={toSizedImage(article.image, SLIDE_IMAGE_WIDTH)}
        linkBar={bar}
      >
        {bodyNodes(article.body)}
      </GeneratePage>
    );

  return (
    <div className="max-w-2xl space-y-8">
      {bar}
      {reading ? (
        <Reading>Reading the article…</Reading>
      ) : (
        <Landing page={pageOf(params)} />
      )}
    </div>
  );
}

function Landing({ page }: { page: number }) {
  /* a pointer resting on a title, or a finger on it, is a click on its way:
     the article is read in the meantime, and the page it opens finds it in
     the shared client. A short dwell, so sweeping across the list does not
     read every article */
  const hover = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prefetch = (link: string) =>
    void queryClient.query(articleQuery(toArticleSlug(link))).catch(() => {});
  const soon = (link: string) => {
    clearTimeout(hover.current);
    hover.current = setTimeout(() => prefetch(link), 120);
  };
  const recent = useQuery(recentQuery(page), queryClient);
  useEffect(() => {
    if (recent.error)
      console.error("could not read the recent articles", recent.error);
  }, [recent.error]);

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          Or start from a recent article
        </h2>

        {/* what was read stays on screen if a later read fails */}
        {!recent.data ? (
          recent.isError ? (
            <ReadFailed
              message={couldNotRead(recent.error, "the recent articles")}
              onRetry={() => void recent.refetch()}
              retrying={recent.isFetching}
            />
          ) : (
            <Reading>Reading the latest articles…</Reading>
          )
        ) : (
          <>
            <ul className="space-y-1.5 text-sm">
              {recent.data.articles.map((article) => (
                <li key={article.link} className="flex">
                  <span className="text-muted-foreground w-16 shrink-0 pr-4 text-nowrap tabular-nums">
                    {article.date}
                  </span>
                  <a
                    className="decoration-muted-foreground/40 hover:decoration-foreground underline underline-offset-4"
                    href={`/generate?article=${toArticleSlug(article.link)}`}
                    onPointerEnter={() => soon(article.link)}
                    onPointerLeave={() => clearTimeout(hover.current)}
                    onTouchStart={() => prefetch(article.link)}
                    onFocus={() => soon(article.link)}
                    dangerouslySetInnerHTML={{ __html: article.title }}
                  />
                </li>
              ))}
            </ul>

            <nav
              aria-label="Recent articles"
              className="text-muted-foreground flex items-center gap-4 text-sm"
            >
              {page > 1 && (
                <a
                  href={`/generate?page=${page - 1}`}
                  data-keep-scroll
                  className="hover:text-foreground flex items-center gap-1"
                >
                  <ChevronLeftIcon className="size-4" />
                  <span className="underline underline-offset-4">Previous</span>
                </a>
              )}
              <p>Page {page}</p>
              {page < recent.data.pages && (
                <a
                  href={`/generate?page=${page + 1}`}
                  data-keep-scroll
                  className="hover:text-foreground flex items-center gap-1"
                >
                  <span className="underline underline-offset-4">Next</span>
                  <ChevronRightIcon className="size-4" />
                </a>
              )}
            </nav>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Or make a custom post</h2>
        <a
          href="/custom"
          data-astro-prefetch
          /* merged, or the base's transparent border beats the outline's */
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Custom post
        </a>
      </section>
    </>
  );
}

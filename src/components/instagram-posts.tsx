/*
  Instagram Posts, read in the browser (ADR 0012). The page is a static file;
  this reads `?article=` and `?page=` off the address and asks WordPress for the
  article or the recent list itself. Nothing on the page moved in the change:
  the landing and the slides are laid out exactly as they were.
*/

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { createElement, useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "~/lib/query-client";
import { toArticleSlug } from "~/lib/services/wordpress/article-url";
import {
  SLIDE_IMAGE_WIDTH,
  toSizedImage,
} from "~/lib/services/wordpress/image-url";
import { pageOf } from "~/lib/services/wordpress/urls";
import { GeneratePage } from "./generate-page";
import { articleQuery, recentQuery } from "./queries";
import { couldNotRead, ReadFailed, Reading } from "./read-state";
import { Button, buttonVariants } from "./ui/button";
import { Input } from "./ui/input";
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
  const { params, typed, link, reading, article, error } =
    useArticleFromAddress();

  if (reading) return <Reading>Reading the article…</Reading>;

  if (article && link)
    return (
      <GeneratePage
        defaultTitle={article.title}
        defaultArticleByline={article.author ?? ""}
        defaultImageByline={article.imageCredits ?? ""}
        articleLink={link}
        imageURI={toSizedImage(article.image, SLIDE_IMAGE_WIDTH)}
      >
        {bodyNodes(article.body)}
      </GeneratePage>
    );

  const page = pageOf(params);
  return <Landing typed={typed} error={error} page={page} />;
}

function Landing({
  typed,
  error,
  page,
}: {
  typed: string;
  error: string | null;
  page: number;
}) {
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
      {/* the same header every tool opens with; ~/components/page-header */}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Instagram Posts
        </h1>
        <p className="text-muted-foreground text-sm">
          The title and content slides for an article, ready to save and post.
        </p>
      </header>

      <form action="/generate" className="mt-6 flex max-w-xl gap-2">
        <Input
          type="text"
          name="article"
          defaultValue={typed}
          placeholder="Paste an article link"
          aria-label="Article link"
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit">Make slides</Button>
      </form>

      {error && <p className="text-destructive pt-2 text-sm">{error}</p>}

      <h2 className="pt-8 pb-2 font-semibold">
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
          <ul className="pb-2">
            {recent.data.articles.map((article) => (
              <li key={article.link} className="flex pb-1">
                <span className="text-muted-foreground w-16 shrink-0 pr-4 text-nowrap">
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

          <div className="text-muted-foreground flex max-w-fit gap-4 pt-1 text-sm">
            {page > 1 && (
              <a href={`/generate?page=${page - 1}`} data-keep-scroll>
                <ChevronLeftIcon className="mb-0.5 inline size-4" />
                <span className="underline">Previous</span>
              </a>
            )}
            <p>Page {page}</p>
            {page < recent.data.pages && (
              <a href={`/generate?page=${page + 1}`} data-keep-scroll>
                <span className="underline">Next</span>
                <ChevronRightIcon className="mb-0.5 inline size-4" />
              </a>
            )}
          </div>
        </>
      )}

      <h2 className="pt-8 pb-2 font-semibold">Or make a custom post</h2>

      <a
        href="/custom"
        data-astro-prefetch
        className={buttonVariants({ variant: "outline" })}
      >
        Custom post
      </a>
    </>
  );
}

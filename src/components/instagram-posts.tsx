/*
  Instagram Posts, read in the browser (ADR 0012). The page is a static file;
  this reads `?article=` and `?page=` off the address and asks WordPress for the
  article or the recent list itself. Nothing on the page moved in the change:
  the landing and the slides are laid out exactly as they were.
*/

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { startEarly } from "~/lib/early";
import { articleUrl } from "~/lib/services/wordpress/urls";
import {
  getRecentArticles,
  type RecentArticle,
} from "~/lib/services/wordpress/get-recent-articles";
import {
  toArticleLink,
  toArticleSlug,
} from "~/lib/services/wordpress/article-url";
import {
  SLIDE_IMAGE_WIDTH,
  toSizedImage,
} from "~/lib/services/wordpress/image-url";
import { Throttled } from "~/lib/services/wordpress/request";
import { scrapeArticle } from "~/lib/services/wordpress/scrape-article";
import { GeneratePage } from "./generate-page";
import { LoaderCircle } from "./loader-circle";
import { Button, buttonVariants } from "./ui/button";
import { Input } from "./ui/input";

type Article = Awaited<ReturnType<typeof scrapeArticle>>;

/** why an article couldn't be shown, in the words the page uses */
export function articleError(error: unknown): string {
  return error instanceof Throttled
    ? "WordPress is busy right now. Try again in a minute."
    : "That article couldn't be read. Check the link, and that it's published.";
}

export const NOT_OURS =
  "That isn't a link to a Hare article. It should start with theumdhare.com.";

/** the article's body elements as react ones, so the content slide can
    show and hide them one by one */
export function bodyNodes(body: Element[]): ReactNode[] {
  return body.map((element, index) =>
    createElement(element.tagName.toLowerCase(), {
      key: index,
      /* scrubbed when the article was read */
      dangerouslySetInnerHTML: { __html: element.innerHTML },
    }),
  );
}

export function InstagramPosts() {
  const [params] = useState(() =>
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search),
  );
  const typed = params.get("article") ?? "";
  const link = typed ? toArticleLink(typed) : undefined;

  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState<string | null>(
    typed && !link ? NOT_OURS : null,
  );

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    scrapeArticle(link)
      .then((read) => {
        if (cancelled) return;
        setArticle(read);
        /* the address names the article the short way, as it always has */
        const url = new URL(window.location.href);
        url.searchParams.set("article", toArticleSlug(link));
        window.history.replaceState(window.history.state, "", url);
      })
      .catch((thrown: unknown) => {
        console.error("could not read the article", thrown);
        if (!cancelled) setError(articleError(thrown));
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  if (link && !error && !article)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin" />
        Reading the article…
      </p>
    );

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

  const page = Math.max(1, Number(params.get("page")) || 1);
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
  /* a short dwell, so sweeping across the list does not read every article */
  const hover = useRef<ReturnType<typeof setTimeout>>(undefined);
  const soon = (link: string) => {
    clearTimeout(hover.current);
    hover.current = setTimeout(
      () => startEarly(articleUrl(toArticleSlug(link))),
      120,
    );
  };
  const [recent, setRecent] = useState<
    { articles: RecentArticle[]; pages: number } | "failed" | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    getRecentArticles(page)
      .then((read) => !cancelled && setRecent(read))
      .catch((thrown: unknown) => {
        console.error("could not read the recent articles", thrown);
        if (!cancelled) setRecent("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

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

      {recent === null ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          Reading the latest articles…
        </p>
      ) : recent === "failed" ? (
        <p className="text-muted-foreground text-sm">
          The recent articles couldn't be read just now. Try again in a minute.
        </p>
      ) : (
        <>
          <ul className="pb-2">
            {recent.articles.map((article) => (
              <li key={article.link} className="flex pb-1">
                <span className="text-muted-foreground w-16 shrink-0 pr-4 text-nowrap">
                  {article.date}
                </span>
                <a
                  className="decoration-muted-foreground/40 hover:decoration-foreground underline underline-offset-4"
                  href={`/generate?article=${toArticleSlug(article.link)}`}
                  /* a pointer resting on it, or a finger on it, is a click on
                     its way: the article is read in the meantime */
                  onPointerEnter={() => soon(article.link)}
                  onPointerLeave={() => clearTimeout(hover.current)}
                  onTouchStart={() =>
                    startEarly(articleUrl(toArticleSlug(article.link)))
                  }
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
            {page < recent.pages && (
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

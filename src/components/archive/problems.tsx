import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Button, buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  PROBLEM_KINDS,
  type ArchiveArticle,
  type SimilarNames,
} from "~/lib/credits/archive";
import { applyFilters, NO_FILTERS } from "~/lib/credits/stats";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { formatDate } from "./dates";
import { useEdit } from "./use-edit";

const EDIT_IN_WORDPRESS = (id: number) =>
  `https://theumdhare.com/wp-admin/post.php?post=${id}&action=edit`;

const needsWork = (article: ArchiveArticle) =>
  article.problems.length > 0 && !article.ignored;

export function ProblemsPage() {
  return (
    <ArchiveShell roleFilter={false}>
      {(props) => <Problems {...props} />}
    </ArchiveShell>
  );
}

function Problems({ archive, filters, refresh }: ViewProps) {
  /* back from fixing something in WordPress, read it again so the fix shows */
  const away = useRef(false);
  useEffect(() => {
    const back = () => {
      if (!away.current) return;
      away.current = false;
      refresh();
    };
    window.addEventListener("focus", back);
    return () => window.removeEventListener("focus", back);
  }, [refresh]);

  const shown = useMemo(
    () => applyFilters(archive.articles, filters),
    [archive, filters],
  );
  const open = shown.filter(needsWork);
  const ignored = shown.filter((a) => a.problems.length > 0 && a.ignored);
  /* filters must never quietly hide something that needs fixing */
  const outside =
    applyFilters(archive.articles, NO_FILTERS).filter(needsWork).length -
    open.length;
  const similar = archive.similarNames.filter((pair) => !pair.ignored);
  const different = archive.similarNames.filter((pair) => pair.ignored);

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="font-semibold">
            {open.length === 0
              ? "Every article's credits read cleanly"
              : `${open.length} ${open.length === 1 ? "article" : "articles"} to check`}
          </h2>
          {outside > 0 && (
            <span className="text-muted-foreground text-sm">
              {outside} more outside these filters
            </span>
          )}
        </div>
        {open.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {open.map((article) => (
              <ArticleProblems
                key={article.id}
                article={article}
                onLeave={() => (away.current = true)}
              />
            ))}
          </ul>
        )}
      </section>

      {similar.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">Names that might be one person</h2>
            <p className="text-muted-foreground text-sm">
              Fix the spelling in WordPress, or say they're different people.
            </p>
          </div>
          <ul className="divide-y rounded-xl border">
            {similar.map((pair) => (
              <PairRow key={pair.names.join("|")} pair={pair} />
            ))}
          </ul>
        </section>
      )}

      <Ignored articles={ignored} pairs={different} />
    </div>
  );
}

function ArticleProblems({
  article,
  onLeave,
}: {
  article: ArchiveArticle;
  onLeave: () => void;
}) {
  const save = useEdit();
  const ignore = () =>
    save.mutate({
      edit: { kind: "ignore", postId: article.id, ignored: true },
      done: `Ignored “${article.title}”`,
      undo: { kind: "ignore", postId: article.id, ignored: false },
    });

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <a
            href={article.link}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:underline"
          >
            {article.title}
          </a>
          <p className="text-muted-foreground text-sm">
            {formatDate(article.publishedAt)} · {article.section}
          </p>
        </div>
        <ul className="space-y-1.5 text-sm">
          {article.problems.map((problem, index) => (
            <li key={index}>
              {PROBLEM_KINDS[problem.kind]}
              {problem.kind === "unrecognised" && (
                <a
                  href={`/settings${problem.label ? `?label=${encodeURIComponent(problem.label)}` : ""}#labels`}
                  className="text-muted-foreground hover:text-foreground ml-2 underline underline-offset-4"
                >
                  {problem.label ? `Add “${problem.label}:”` : "Add the label"}
                </a>
              )}
              {(problem.kind === "unrecognised" ||
                problem.kind === "no-colon" ||
                problem.kind === "unparsed" ||
                problem.kind === "odd-name") && (
                <span className="text-muted-foreground mt-1 block border-l-2 pl-2 text-[13px] break-words">
                  {problem.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="text-muted-foreground -ml-2 flex shrink-0 gap-1 sm:-mr-2 sm:ml-0">
        <a
          href={EDIT_IN_WORDPRESS(article.id)}
          target="_blank"
          rel="noreferrer"
          onClick={onLeave}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          Edit in WordPress <ExternalLinkIcon />
        </a>
        <Button
          variant="ghost"
          size="sm"
          disabled={save.isPending}
          onClick={ignore}
          title="Hide this article's problems; it stays in every count"
        >
          Ignore
        </Button>
      </div>
    </li>
  );
}

function PairRow({ pair }: { pair: SimilarNames }) {
  const save = useEdit();
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 text-sm">
      <span>
        {pair.names.map((name, i) => (
          <span key={name}>
            {i > 0 && <span className="text-muted-foreground"> and </span>}
            <a
              href={`/articles?q=${encodeURIComponent(name)}`}
              className="decoration-muted-foreground/40 font-medium underline underline-offset-4"
            >
              {name}
            </a>
            <span className="text-muted-foreground tabular-nums">
              {" "}
              ({pair.counts[i]})
            </span>
          </span>
        ))}
      </span>
      <Button
        className="text-muted-foreground"
        variant="ghost"
        size="sm"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({
            edit: {
              kind: "different-people",
              names: pair.names,
              different: true,
            },
            done: `Marked ${pair.names.join(" and ")} as different people`,
            undo: {
              kind: "different-people",
              names: pair.names,
              different: false,
            },
          })
        }
      >
        Different people
      </Button>
    </li>
  );
}

function Ignored({
  articles,
  pairs,
}: {
  articles: ArchiveArticle[];
  pairs: SimilarNames[];
}) {
  const save = useEdit();
  const count = articles.length + pairs.length;
  if (count === 0) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm">
        <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
        {count} ignored
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-3 divide-y rounded-xl border text-sm">
          {articles.map((article) => (
            <li
              key={article.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2"
            >
              <span className="min-w-0 flex-1">
                {article.title}
                <span className="text-muted-foreground">
                  {" "}
                  · ignored by {article.ignored}
                </span>
              </span>
              <Button
                variant="ghost"
                size="xs"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    edit: {
                      kind: "ignore",
                      postId: article.id,
                      ignored: false,
                    },
                    done: `“${article.title}” is back on the list`,
                  })
                }
              >
                Restore
              </Button>
            </li>
          ))}
          {pairs.map((pair) => (
            <li
              key={pair.names.join("|")}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2"
            >
              <span className="min-w-0 flex-1">
                {pair.names.join(" and ")}
                <span className="text-muted-foreground">
                  {" "}
                  · different people
                </span>
              </span>
              <Button
                variant="ghost"
                size="xs"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    edit: {
                      kind: "different-people",
                      names: pair.names,
                      different: false,
                    },
                    done: `${pair.names.join(" and ")} are back on the list`,
                  })
                }
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

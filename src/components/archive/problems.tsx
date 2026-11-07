import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  PROBLEM_KINDS,
  type ArchiveArticle,
  type ProblemKind,
  type SimilarNames,
} from "~/lib/credits/archive";
import { applyFilters, NO_FILTERS } from "~/lib/credits/stats";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { formatDate } from "./dates";
import { useEdit } from "./use-edit";

const EDIT_IN_WORDPRESS = (id: number) =>
  `https://theumdhare.com/wp-admin/post.php?post=${id}&action=edit`;

/* what to do, in a line; the fix is nearly always in WordPress */
const FIXES: Record<ProblemKind, string> = {
  "no-writer": "Add an “Article by:” line in WordPress.",
  "no-image": "Add an “Image Credits:” line in WordPress.",
  unrecognised:
    "Looks like a credit, but no label matches. Reword it in WordPress, or add the label in Settings.",
  unparsed: "The credit line names no one HareWare can read.",
  "odd-name": "Reads like a sentence. Check the line's punctuation.",
  uncategorized: "Pick a section in WordPress.",
};

const needsWork = (article: ArchiveArticle) =>
  article.problems.length > 0 && !article.ignored;

export function ProblemsPage() {
  return <ArchiveShell>{(props) => <Problems {...props} />}</ArchiveShell>;
}

function Problems({ archive, filters }: ViewProps) {
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
              <ArticleProblems key={article.id} article={article} />
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

function ArticleProblems({ article }: { article: ArchiveArticle }) {
  const save = useEdit();
  const ignore = (ignored: boolean) =>
    save.mutate(
      { edit: { kind: "ignore", postId: article.id, ignored } },
      {
        onSuccess: () =>
          ignored &&
          toast(`Ignored “${article.title}”`, {
            action: {
              label: "Undo",
              onClick: () =>
                save.mutate({
                  edit: { kind: "ignore", postId: article.id, ignored: false },
                }),
            },
          }),
      },
    );

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-4">
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
              <span className="font-medium">
                {PROBLEM_KINDS[problem.kind]}.
              </span>{" "}
              <span className="text-muted-foreground">
                {FIXES[problem.kind]}
              </span>
              {(problem.kind === "unrecognised" ||
                problem.kind === "unparsed" ||
                problem.kind === "odd-name") && (
                <span className="bg-muted text-muted-foreground mt-1 block w-fit max-w-full truncate rounded px-1.5 py-0.5 text-xs">
                  {problem.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex shrink-0 gap-1">
        <a
          href={EDIT_IN_WORDPRESS(article.id)}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Edit in WordPress <ExternalLinkIcon />
        </a>
        <Button
          variant="ghost"
          size="sm"
          disabled={save.isPending}
          onClick={() => ignore(true)}
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
              className="font-medium hover:underline"
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
            done: "Noted as different people",
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
                  · {article.ignored}
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
                    done: `Restored “${article.title}”`,
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
                    done: "Restored",
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

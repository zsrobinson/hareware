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
  bylineKey,
  PROBLEM_KINDS,
  similarNames,
  type ArchiveArticle,
  type SimilarNames,
} from "~/lib/credits/archive";
import { peopleOf } from "~/lib/credits/person";
import { applyFilters, NO_FILTERS } from "~/lib/credits/stats";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { formatDate } from "./dates";
import { articleHref } from "./open-row";
import { useRemovals } from "./removals";
import { SectionName } from "./section-name";
import { useEdit } from "./use-edit";

const EDIT_IN_WORDPRESS = (id: number) =>
  `https://theumdhare.com/wp-admin/post.php?post=${id}&action=edit`;

const needsWork = (article: ArchiveArticle) =>
  article.problems.length > 0 && !article.ignored;

export function ProblemsPage() {
  return (
    /* a list to work through: a date cut would hide what is still wrong */
    <ArchiveShell roleFilter={false} defaultPreset="all">
      {(props) => <Problems {...props} />}
    </ArchiveShell>
  );
}

function Problems({ archive, filters, refresh, filterNote }: ViewProps) {
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
  /* the costly comparison, so only this page makes it, and once per archive */
  const pairs = useMemo(() => similarNames(archive), [archive]);
  const similar = pairs.filter((pair) => !pair.ignored);
  const different = pairs.filter((pair) => pair.ignored);

  const ignoring = useRemovals(open, (article) => String(article.id));
  const separating = useRemovals(similar, (pair) => pair.names.join("|"));

  const ignore = (article: ArchiveArticle) =>
    ignoring.remove(article, {
      done: `Ignored “${article.title}”; it still counts`,
      restored: `“${article.title}” is back on the list`,
      undoLabel: `Undo ignoring ${article.title}`,
      edit: () => ({ kind: "ignore", postId: article.id, ignored: true }),
      undo: () => ({ kind: "ignore", postId: article.id, ignored: false }),
    });
  const separate = (pair: SimilarNames) =>
    separating.remove(pair, {
      done: `Marked ${pair.names.join(" and ")} as different people`,
      restored: `${pair.names.join(" and ")} are back on the list`,
      undoLabel: `Undo marking ${pair.names.join(" and ")} as different people`,
      edit: () => ({
        kind: "different-people",
        names: pair.names,
        different: true,
      }),
      undo: () => ({
        kind: "different-people",
        names: pair.names,
        different: false,
      }),
    });

  return (
    <div className="space-y-10">
      {archive.unscoped.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {archive.unscoped.length}{" "}
          {archive.unscoped.length === 1
            ? "pen name in the Sheet names"
            : "pen names in the Sheet name"}{" "}
          no article, so{" "}
          {archive.unscoped.length === 1 ? "it counts" : "they count"} nowhere.{" "}
          <a
            href="/settings"
            className="hover:text-foreground underline underline-offset-4"
          >
            Set them in Settings
          </a>
        </p>
      )}
      <section className="space-y-3">
        {/* the count as People and Articles give theirs, over the list */}
        <h2 className="text-muted-foreground text-sm font-normal tabular-nums">
          {[
            open.length === 0
              ? "Every article's credits read cleanly"
              : `${open.length} ${open.length === 1 ? "article" : "articles"} to check`,
            filterNote,
            outside > 0 && `${outside} more outside these filters`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </h2>
        {ignoring.entries.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {ignoring.entries.map(({ key, item, removed }) =>
              removed ? (
                ignoring.removedRow(key, "px-4")
              ) : (
                <ArticleProblems
                  key={key}
                  article={item}
                  ignoreRef={ignoring.focusBack(key)}
                  onIgnore={() => ignore(item)}
                  onLeave={() => (away.current = true)}
                />
              ),
            )}
          </ul>
        )}
        {ignoring.status}
      </section>

      {separating.entries.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">
              Names that might be one person
            </h2>
            <p className="text-muted-foreground text-sm">
              Fix the spelling in WordPress, or say they're different people.
            </p>
          </div>
          <ul className="divide-y rounded-lg border">
            {separating.entries.map(({ key, item, removed }) =>
              removed ? (
                separating.removedRow(key, "px-4")
              ) : (
                <PairRow
                  key={key}
                  pair={item}
                  separateRef={separating.focusBack(key)}
                  onSeparate={() => separate(item)}
                />
              ),
            )}
          </ul>
          {separating.status}
        </section>
      )}

      <NewNames archive={archive} />

      <Ignored articles={ignored} pairs={different} />
    </div>
  );
}

const NEW_FOR_DAYS = 30;

/**
 * Names first credited in the last month, printed as themselves. A new pen
 * name looks exactly like a new person, so only someone who knows can tell:
 * this is where they look. It needs no answer, and a name leaves on its own.
 */
function NewNames({ archive }: { archive: ViewProps["archive"] }) {
  const names = useMemo(() => {
    /* counted from the read, so the list holds still while the page is open */
    const since =
      Date.parse(archive.fetchedAt) - NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
    const people = [...peopleOf(archive.articles).values()];
    /* a name someone has been said to write under is a known pen name */
    const answered = new Set(
      people.flatMap((person) =>
        person.penNames.map((use) => bylineKey(use.byline)),
      ),
    );
    /* new is a person's first contribution, however it was credited:
       someone who wrote under a pen name before is not new when they sign
       their own */
    return people
      .filter(
        ({ name, first: { article } }) =>
          Date.parse(article.publishedAt) >= since &&
          !answered.has(bylineKey(name)) &&
          article.credits.some((c) =>
            c.contributors.some(
              (p) => p.source === "printed" && p.name === name,
            ),
          ),
      )
      .map(({ name, first }) => [name, first.article] as const)
      .sort(([, a], [, b]) => b.publishedAt.localeCompare(a.publishedAt));
  }, [archive]);

  if (names.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">New names</h2>
        <p className="text-muted-foreground text-sm">
          First credited in the last {NEW_FOR_DAYS} days, in case one is a pen
          name.
        </p>
      </div>
      <ul className="divide-y rounded-lg border text-sm">
        {names.map(([name, article]) => (
          <li
            key={name}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-2"
          >
            <span className="font-medium">{name}</span>
            <a
              href={articleHref(article.id)}
              className="text-muted-foreground hover:text-foreground min-w-0 truncate underline-offset-4 hover:underline"
            >
              {article.title} · {formatDate(article.publishedAt)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArticleProblems({
  article,
  onIgnore,
  ignoreRef,
  onLeave,
}: {
  article: ArchiveArticle;
  onIgnore: () => void;
  ignoreRef: (element: HTMLElement | null) => void;
  onLeave: () => void;
}) {
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
            {formatDate(article.publishedAt)} ·{" "}
            <SectionName section={article.section} />
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
              {problem.kind === "pen-name-again" && (
                <a
                  href={articleHref(article.id)}
                  className="text-muted-foreground hover:text-foreground ml-2 underline underline-offset-4"
                >
                  Say who
                </a>
              )}
              {(problem.kind === "unrecognised" ||
                problem.kind === "no-colon" ||
                problem.kind === "unparsed" ||
                problem.kind === "odd-name" ||
                problem.kind === "pen-name-again") && (
                <span className="text-muted-foreground mt-1 block border-l-2 pl-2 text-[13px] break-words">
                  {problem.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex shrink-0 gap-1 sm:-mr-2">
        <a
          href={EDIT_IN_WORDPRESS(article.id)}
          target="_blank"
          rel="noreferrer"
          onClick={onLeave}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Edit in WordPress <ExternalLinkIcon />
        </a>
        <Button
          ref={ignoreRef}
          variant="ghost"
          className="text-muted-foreground"
          onClick={onIgnore}
          title="Hide this article's problems; it stays in every count"
        >
          Ignore
        </Button>
      </div>
    </li>
  );
}

function PairRow({
  pair,
  onSeparate,
  separateRef,
}: {
  pair: SimilarNames;
  onSeparate: () => void;
  separateRef: (element: HTMLElement | null) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 text-sm">
      <span>
        {pair.names.map((name, i) => (
          <span key={name}>
            {i > 0 && <span className="text-muted-foreground"> and </span>}
            <a
              href={`/articles?${new URLSearchParams({ people: name })}`}
              className="font-medium underline-offset-4 hover:underline"
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
        ref={separateRef}
        className="text-muted-foreground"
        variant="ghost"
        onClick={onSeparate}
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
        <ul className="mt-3 divide-y rounded-lg border text-sm">
          {articles.map((article) => (
            <li
              key={article.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 pr-1.5 pl-4"
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
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 pr-1.5 pl-4"
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

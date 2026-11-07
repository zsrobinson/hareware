import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  PencilIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  PROBLEM_KINDS,
  type Archive,
  type ArchiveArticle,
  type ProblemKind,
} from "~/lib/credits/archive";
import { ROLE_NAMES } from "~/lib/credits/labels";
import { applyFilters, NO_FILTERS } from "~/lib/credits/stats";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { formatDate } from "./dates";

const EDIT = (id: number) =>
  `https://theumdhare.com/wp-admin/post.php?post=${id}&action=edit`;

const FIXES: Record<ProblemKind, string> = {
  "no-writer":
    "Add an “Article by:” line. If the writer can't be printed, add a writing row for the post to the Sheet's Overrides tab.",
  "no-image":
    "Add an “Image Credits:” line, or an images row to the Sheet's Overrides tab.",
  unparsed:
    "The line has a label but no name HareWare could read. Write the names separated by commas or “and”.",
  "odd-name":
    "This reads like a sentence, not a name. Check the line's punctuation.",
  uncategorized: "Give the post a category in WordPress.",
};

export function ProblemsPage() {
  return <ArchiveShell>{(props) => <Problems {...props} />}</ArchiveShell>;
}

function useIgnore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: number) => {
      const response = await fetch("/api/sheet/ignore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      if (!response.ok) throw new Error(await response.text());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["archive"] }),
  });
}

const needsWork = (article: ArchiveArticle) =>
  article.problems.length > 0 && !article.ignored;

function Problems({ archive, filters }: ViewProps) {
  const ignore = useIgnore();
  const shown = useMemo(
    () => applyFilters(archive.articles, filters),
    [archive, filters],
  );
  const open = shown.filter(needsWork);
  const ignored = shown.filter((a) => a.problems.length > 0 && a.ignored);
  /* filters should never quietly hide something that needs fixing */
  const hiddenByFilters = useMemo(
    () =>
      applyFilters(archive.articles, NO_FILTERS).filter(needsWork).length -
      open.length,
    [archive, open.length],
  );
  const canWrite = archive.sheet.status === "read";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-semibold">
          {open.length === 0
            ? "Nothing to fix"
            : `${open.length} ${open.length === 1 ? "post needs" : "posts need"} a look`}
        </h2>
        {hiddenByFilters > 0 && (
          <p className="text-muted-foreground text-sm">
            {hiddenByFilters} more {hiddenByFilters === 1 ? "is" : "are"}{" "}
            outside the filters above.
          </p>
        )}
      </div>

      {ignore.error && (
        <p className="text-destructive text-sm">
          Could not ignore that post: {ignore.error.message}
        </p>
      )}

      {open.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CheckIcon className="size-4" /> Every post in view has readable
          credits and a section.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {open.map((article) => (
            <li key={article.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 space-y-0.5">
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium hover:underline"
                  >
                    {article.title}
                  </a>
                  <p className="text-muted-foreground text-sm">
                    {formatDate(article.publishedAt)} · {article.section} · post{" "}
                    {article.id}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <a
                    href={EDIT(article.id)}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    <PencilIcon /> Edit in WordPress
                  </a>
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ignore.isPending}
                      onClick={() => ignore.mutate(article.id)}
                      title="Adds the post to the Sheet's Ignored tab. Delete the row there to undo."
                    >
                      <EyeOffIcon /> Not a problem
                    </Button>
                  )}
                </div>
              </div>
              <ul className="space-y-1.5 text-sm">
                {article.problems.map((problem, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-baseline gap-x-2"
                  >
                    <Badge
                      variant="outline"
                      className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                    >
                      {PROBLEM_KINDS[problem.kind]}
                    </Badge>
                    {(problem.kind === "unparsed" ||
                      problem.kind === "odd-name") && (
                      <code className="bg-muted rounded px-1 text-xs">
                        {problem.detail}
                      </code>
                    )}
                    <span className="text-muted-foreground">
                      {FIXES[problem.kind]}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {ignored.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm">
            <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
            Show {ignored.length} ignored{" "}
            {ignored.length === 1 ? "post" : "posts"}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="text-muted-foreground mt-2 text-sm">
              To bring one back, delete its row from the Sheet's Ignored tab.
            </p>
            <ul className="mt-2 divide-y rounded-xl border text-sm">
              {ignored.map((article) => (
                <li
                  key={article.id}
                  className="flex flex-wrap justify-between gap-x-4 px-4 py-2"
                >
                  <span>{article.title}</span>
                  <span className="text-muted-foreground">
                    {article.ignored}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      <SheetPanel archive={archive} />
    </div>
  );
}

function SheetPanel({ archive }: { archive: Archive }) {
  const queryClient = useQueryClient();
  const setup = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/sheet/setup", { method: "POST" });
      const text = await response.text();
      if (!response.ok) throw new Error(text);
      return (JSON.parse(text) as { summary: string }).summary;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["archive"] }),
  });

  const { sheet } = archive;
  const overridden = new Set(
    archive.articles
      .filter((a) => a.credits.some((c) => c.overridden))
      .map((a) => a.id),
  ).size;
  const status =
    sheet.status === "unconfigured"
      ? "Not connected yet, so every byline counts as printed."
      : sheet.status === "failed"
        ? `Could not be read just now, so every byline counts as printed. ${sheet.reason}`
        : `Connected. ${overridden} ${overridden === 1 ? "post has" : "posts have"} real names set there.`;

  return (
    <section className="space-y-3 border-t pt-6 text-sm">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-semibold">
          The Sheet
          {sheet.status === "read" && sheet.url && (
            <a
              href={sheet.url}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "xs" })}
            >
              Open <ExternalLinkIcon />
            </a>
          )}
        </h2>
        <p
          className={
            sheet.status === "failed"
              ? "text-destructive"
              : "text-muted-foreground"
          }
        >
          {status}
        </p>
      </div>

      {archive.sheetProblems.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium">Rows HareWare could not use</p>
          <ul className="space-y-0.5">
            {archive.sheetProblems.map((problem) => (
              <li key={`${problem.tab}-${problem.row}`}>
                {problem.tab}, row {problem.row}:{" "}
                <span className="text-muted-foreground">{problem.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Collapsible>
        <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex items-center gap-1.5">
          <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
          Which lines count as credits
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="text-muted-foreground mt-2">
            A short paragraph starting with one of these labels and a colon. Add
            one to the Sheet's Labels tab to recognise a new kind of credit.
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {archive.labels.map((label) => (
              <li key={label.label}>
                {label.label}:{" "}
                <span className="text-muted-foreground">
                  {ROLE_NAMES[label.role]}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      {sheet.status !== "unconfigured" && (
        <Collapsible>
          <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex items-center gap-1.5">
            <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
            Sheet setup
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2">
              <p className="text-muted-foreground">
                HareWare reads three tabs: Overrides, Labels and Ignored. This
                creates any that are missing, with their header row, and fills
                an empty Labels tab with the built-in labels. It never changes a
                row that is already there.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setup.mutate()}
                disabled={setup.isPending}
              >
                {setup.isPending ? "Checking…" : "Create missing tabs"}
              </Button>
              {setup.data && (
                <p className="text-muted-foreground">Done: {setup.data}.</p>
              )}
              {setup.error && (
                <p className="text-destructive">{setup.error.message}</p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}

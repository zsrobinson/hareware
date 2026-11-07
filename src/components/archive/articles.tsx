import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable, sortable } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import {
  PROBLEM_KINDS,
  type ArchiveArticle,
  type Credit,
} from "~/lib/credits/archive";
import type { Role } from "~/lib/credits/labels";
import { applyFilters, easternDate } from "~/lib/credits/stats";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { formatDate } from "./dates";

export function ArticlesPage() {
  return <ArchiveShell>{(props) => <Articles {...props} />}</ArchiveShell>;
}

const namesFor = (article: ArchiveArticle, role: Role) =>
  article.credits
    .filter((credit) => credit.role === role)
    .flatMap((credit) => credit.names)
    .join(", ");

/** who is counted, with the printed byline beneath when the Sheet changed it */
function Credited({ credits }: { credits: Credit[] }) {
  if (credits.length === 0)
    return <span className="text-muted-foreground/60">—</span>;
  return (
    <div className="space-y-0.5">
      {credits.map((credit, index) => (
        <div key={index}>
          {credit.names.join(", ") || (
            <span className="text-muted-foreground italic">unreadable</span>
          )}
          {credit.overridden && credit.printed && (
            <span className="text-muted-foreground block text-xs">
              printed as {credit.printed}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

const columns: ColumnDef<ArchiveArticle, unknown>[] = [
  {
    id: "date",
    accessorFn: (article) => easternDate(article.publishedAt),
    header: sortable("Published"),
    meta: { csvHeader: "Published" },
    cell: ({ row }) => (
      <span className="text-muted-foreground whitespace-nowrap tabular-nums">
        {formatDate(row.original.publishedAt)}
      </span>
    ),
  },
  {
    accessorKey: "title",
    header: sortable("Title"),
    cell: ({ row }) => (
      <a
        href={row.original.link}
        target="_blank"
        rel="noreferrer"
        className="block max-w-md min-w-56 font-medium whitespace-normal hover:underline"
      >
        {row.original.title}
      </a>
    ),
  },
  {
    accessorKey: "section",
    header: sortable("Section"),
  },
  {
    id: "writers",
    accessorFn: (article) => namesFor(article, "writer"),
    header: sortable("Writing"),
    meta: { csvHeader: "Writing" },
    cell: ({ row }) => (
      <div className="min-w-36 whitespace-normal">
        <Credited
          credits={row.original.credits.filter((c) => c.role === "writer")}
        />
      </div>
    ),
  },
  {
    id: "images",
    accessorFn: (article) => namesFor(article, "image"),
    header: sortable("Images"),
    meta: { csvHeader: "Images" },
    cell: ({ row }) => (
      <div className="min-w-36 whitespace-normal">
        <Credited
          credits={row.original.credits.filter((c) => c.role === "image")}
        />
      </div>
    ),
  },
  {
    id: "problems",
    accessorFn: (article) =>
      article.ignored
        ? ""
        : article.problems.map((p) => PROBLEM_KINDS[p.kind]).join("; "),
    header: "Problems",
    meta: { csvHeader: "Problems" },
    cell: ({ row }) => {
      const { problems, ignored } = row.original;
      if (problems.length === 0 || ignored) return null;
      return (
        <Badge
          variant="outline"
          render={
            <a href={`/problems?q=${encodeURIComponent(row.original.title)}`} />
          }
          title={problems.map((p) => PROBLEM_KINDS[p.kind]).join(", ")}
        >
          {problems.length === 1
            ? PROBLEM_KINDS[problems[0]!.kind]
            : `${problems.length} problems`}
        </Badge>
      );
    },
  },
];

function Articles({ archive, filters }: ViewProps) {
  const rows = useMemo(() => {
    const shown = applyFilters(archive.articles, filters);
    /* a role filter keeps the articles with a credit in that role */
    return filters.roles.length === 0
      ? shown
      : shown.filter((article) =>
          article.credits.some((credit) => filters.roles.includes(credit.role)),
        );
  }, [archive, filters]);

  /* a column with nothing in it is noise */
  const anyProblems = rows.some((a) => a.problems.length > 0 && !a.ignored);
  const shownColumns = useMemo(
    () => (anyProblems ? columns : columns.filter((c) => c.id !== "problems")),
    [anyProblems],
  );

  return (
    <DataTable
      columns={shownColumns}
      data={rows}
      searchable={false}
      empty="No articles match these filters."
      csv="articles"
      toolbar={
        <span className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">{rows.length}</span>{" "}
          {rows.length === 1 ? "article" : "articles"}
        </span>
      }
    />
  );
}

import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLinkIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DataTable, sortable } from "~/components/data-table";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import {
  PROBLEM_KINDS,
  type Archive,
  type ArchiveArticle,
  type Credit,
} from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Role } from "~/lib/credits/labels";
import { same } from "~/lib/credits/sheet";
import { applyFilters, easternDate } from "~/lib/credits/stats";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { formatDate } from "./dates";
import { useEdit } from "./use-edit";

const EDIT_IN_WORDPRESS = (id: number) =>
  `https://theumdhare.com/wp-admin/post.php?post=${id}&action=edit`;

export function ArticlesPage() {
  return <ArchiveShell>{(props) => <Articles {...props} />}</ArchiveShell>;
}

const namesFor = (article: ArchiveArticle, role: Role) =>
  article.credits
    .filter((credit) => credit.role === role)
    .flatMap((credit) => credit.contributors.map((c) => c.name))
    .join(", ");

/** who counts, with the printed name beneath when it is someone else */
function Contributors({ credits }: { credits: Credit[] }) {
  const people = credits.flatMap((credit) => credit.contributors);
  if (people.length === 0)
    return <span className="text-muted-foreground/50">—</span>;
  return (
    <div className="space-y-0.5">
      {people.map((person, index) => (
        <div key={index}>
          {person.name}
          {person.byline && (
            <span className="text-muted-foreground block text-xs">
              as {person.byline}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Articles({ archive, filters }: ViewProps) {
  const [editing, setEditing] = useState<number | null>(null);

  const rows = useMemo(() => {
    const shown = applyFilters(archive.articles, filters);
    /* a role filter keeps the articles with a contribution in that role */
    return filters.roles.length === 0
      ? shown
      : shown.filter((article) =>
          article.credits.some(
            (credit) =>
              filters.roles.includes(credit.role) &&
              credit.contributors.length > 0,
          ),
        );
  }, [archive, filters]);

  const anyOther = rows.some((a) => a.credits.some((c) => c.role === "other"));

  const columns = useMemo<ColumnDef<ArchiveArticle, unknown>[]>(
    () => [
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
        cell: ({ row }) => {
          const open =
            row.original.problems.length > 0 && !row.original.ignored;
          return (
            <div className="max-w-md min-w-56 whitespace-normal">
              <a
                href={row.original.link}
                target="_blank"
                rel="noreferrer"
                className="font-medium hover:underline"
              >
                {row.original.title}
              </a>
              {open && (
                <a
                  href={`/problems?q=${encodeURIComponent(row.original.title)}`}
                  className="text-muted-foreground block text-xs hover:underline"
                >
                  {row.original.problems
                    .map((p) => PROBLEM_KINDS[p.kind])
                    .join(" · ")}
                </a>
              )}
            </div>
          );
        },
      },
      { accessorKey: "section", header: sortable("Section") },
      ...ROLES.filter((role) => role !== "other" || anyOther).map(
        (role): ColumnDef<ArchiveArticle, unknown> => ({
          id: role,
          accessorFn: (article) => namesFor(article, role),
          header: sortable(ROLE_NAMES[role]),
          meta: { csvHeader: ROLE_NAMES[role] },
          cell: ({ row }) => (
            <div className="min-w-36 whitespace-normal">
              <Contributors
                credits={row.original.credits.filter((c) => c.role === role)}
              />
            </div>
          ),
        }),
      ),
      {
        id: "edit",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit contributors of ${row.original.title}`}
            onClick={() => setEditing(row.original.id)}
          >
            <PencilIcon />
          </Button>
        ),
      },
    ],
    [anyOther],
  );

  const article = editing
    ? archive.articles.find((a) => a.id === editing)
    : undefined;

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchable={false}
        empty="No articles match these filters."
        csv="articles"
        toolbar={
          <span className="text-muted-foreground text-sm">
            {rows.length} {rows.length === 1 ? "article" : "articles"}
          </span>
        }
      />
      <Sheet
        open={Boolean(article)}
        onOpenChange={(next) => !next && setEditing(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {article && <ArticlePanel article={article} archive={archive} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ArticlePanel({
  article,
  archive,
}: {
  article: ArchiveArticle;
  archive: Archive;
}) {
  const everyone = useMemo(
    () =>
      [
        ...new Set(
          archive.articles.flatMap((a) =>
            a.credits.flatMap((c) => c.contributors.map((p) => p.name)),
          ),
        ),
      ].sort(),
    [archive],
  );

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6">{article.title}</SheetTitle>
        <SheetDescription>
          {formatDate(article.publishedAt)} · {article.section}
        </SheetDescription>
        <div className="flex gap-2 pt-1">
          <a
            href={article.link}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View <ExternalLinkIcon />
          </a>
          <a
            href={EDIT_IN_WORDPRESS(article.id)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Edit in WordPress <ExternalLinkIcon />
          </a>
        </div>
      </SheetHeader>
      <div className="space-y-6 px-4 pb-6">
        {ROLES.map((role) => (
          <RoleEditor
            key={`${article.id}-${role}`}
            article={article}
            role={role}
            everyone={everyone}
          />
        ))}
        <p className="text-muted-foreground text-xs">
          Changes here apply to this article only. Fix a misspelled byline in
          WordPress instead, so readers see it too.
        </p>
      </div>
    </>
  );
}

/**
 * One role's contributors on one article: each printed name, who it counts
 * as, and anyone added who is not printed. Saving writes this article's rows
 * for the role and nothing else.
 */
function RoleEditor({
  article,
  role,
  everyone,
}: {
  article: ArchiveArticle;
  role: Role;
  everyone: string[];
}) {
  const save = useEdit();
  const list = useId();
  const credits = article.credits.filter((c) => c.role === role);
  const printed = credits.flatMap((c) => c.bylines);
  const people = credits.flatMap((c) => c.contributors);

  /* what this article's own rows say now, as the form's starting point */
  const initial = {
    renamed: Object.fromEntries(
      printed.map((byline) => [
        byline,
        people.find(
          (p) => p.source === "article" && p.byline && same(p.byline, byline),
        )?.name ?? "",
      ]),
    ),
    added: people
      .filter((p) => p.source === "article" && !p.byline)
      .map((p) => p.name),
  };
  const [renamed, setRenamed] = useState<Record<string, string>>(
    initial.renamed,
  );
  const [added, setAdded] = useState<string[]>(initial.added);
  const changed =
    JSON.stringify({ renamed, added }) !== JSON.stringify(initial);

  if (printed.length === 0 && added.length === 0 && role === "other")
    return null;

  /* who a printed name counts as without this article's own row */
  const fallback = (byline: string) =>
    people.find(
      (p) =>
        p.byline !== null &&
        same(p.byline, byline) &&
        p.source === "everywhere",
    )?.name ?? byline;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{ROLE_NAMES[role]}</h3>
        {credits[0]?.printed && (
          <span className="text-muted-foreground truncate text-xs">
            {credits[0].label}: {credits.map((c) => c.printed).join(" / ")}
          </span>
        )}
      </div>

      {printed.length === 0 && added.length === 0 && (
        <p className="text-muted-foreground text-sm">No credit line.</p>
      )}

      <ul className="space-y-1.5">
        {printed.map((byline) => (
          <li
            key={byline}
            className="grid grid-cols-[1fr_auto_1.4fr] items-center gap-2"
          >
            <span className="truncate text-sm">{byline}</span>
            <span className="text-muted-foreground text-xs">counts as</span>
            <Input
              list={list}
              className="h-8"
              value={renamed[byline] ?? ""}
              placeholder={fallback(byline)}
              onChange={(event) =>
                setRenamed({ ...renamed, [byline]: event.target.value })
              }
            />
          </li>
        ))}
        {added.map((name, index) => (
          <li
            key={index}
            className="grid grid-cols-[1fr_auto_1.4fr] items-center gap-2"
          >
            <span className="text-muted-foreground text-sm italic">
              not printed
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Remove"
              onClick={() => setAdded(added.filter((_, i) => i !== index))}
            >
              <XIcon />
            </Button>
            <Input
              list={list}
              className="h-8"
              value={name}
              placeholder="Name"
              onChange={(event) =>
                setAdded(
                  added.map((n, i) => (i === index ? event.target.value : n)),
                )
              }
            />
          </li>
        ))}
      </ul>
      <datalist id={list}>
        {everyone.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setAdded([...added, ""])}
        >
          <PlusIcon /> Add someone not printed
        </Button>
        <span className="flex-1" />
        {changed && (
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setRenamed(initial.renamed);
                setAdded(initial.added);
              }}
            >
              Undo
            </Button>
            <Button
              size="xs"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  edit: {
                    kind: "article-credits",
                    postId: article.id,
                    role,
                    entries: [
                      ...Object.entries(renamed)
                        .filter(([, name]) => name.trim())
                        .map(([byline, realName]) => ({ byline, realName })),
                      ...added
                        .filter((name) => name.trim())
                        .map((realName) => ({ byline: null, realName })),
                    ],
                  },
                  done: `Saved ${ROLE_NAMES[role].toLowerCase()} on “${article.title}”`,
                })
              }
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

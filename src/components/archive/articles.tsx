import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLinkIcon, PlusIcon, XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DataTable, sortable } from "~/components/data-table";
import { FieldRow, FieldRows } from "~/components/field-row";
import { SidePanel, useIsPhone } from "~/components/panel";
import { Button, buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { Input } from "~/components/ui/input";
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
import { OpenRowProvider, RowDetails, RowOpener, useOpenRow } from "./open-row";
import { SectionName } from "./section-name";
import { ShellTableControls } from "./table-controls";
import { useEdit } from "./use-edit";

const EDIT_IN_WORDPRESS = (id: number) =>
  `https://theumdhare.com/wp-admin/post.php?post=${id}&action=edit`;

export function ArticlesPage() {
  return <ArchiveShell>{(props) => <Articles {...props} />}</ArchiveShell>;
}

const SAVED: Record<Role, (title: string) => string> = {
  writer: (title) => `Saved who wrote “${title}”`,
  image: (title) => `Saved who made the image for “${title}”`,
  other: (title) => `Saved the other contributors to “${title}”`,
};

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

/* what a narrower table leaves out until someone asks for it, so none of
   it is cut off at the edge: beside a panel, and on a phone */
const BESIDE_PANEL = ["section", "image", "other"];
const ON_PHONE = ["writer", ...BESIDE_PANEL];

function Articles({ archive, filters, filterNote }: ViewProps) {
  const phone = useIsPhone();
  const openRow = useOpenRow("article");
  const editing = openRow.open === null ? null : Number(openRow.open);

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

  /* "other" credits are rare, so their column waits until someone asks for
     them. Nothing else here depends on which row is open (see open-row.tsx) */
  const anyOther = filters.roles.includes("other");

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
        meta: { csvHeader: "Title" },
        cell: ({ row }) => {
          const open =
            row.original.problems.length > 0 && !row.original.ignored;
          return (
            /* fits beside the date on a phone-wide window that shows a
               scrollbar, so the table only scrolls when it must */
            <div className="max-w-md min-w-52 whitespace-normal">
              <RowOpener
                rowKey={String(row.original.id)}
                className="font-medium"
              >
                {row.original.title}
              </RowOpener>
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
      {
        accessorKey: "section",
        header: sortable("Section"),
        meta: { csvHeader: "Section" },
        cell: ({ row }) => <SectionName section={row.original.section} />,
      },
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
    ],
    [anyOther],
  );

  const article = editing
    ? archive.articles.find((a) => a.id === editing)
    : undefined;

  return (
    <OpenRowProvider value={openRow}>
      <DataTable
        columns={columns}
        data={rows}
        searchable={false}
        empty="No articles match these filters."
        csv="articles"
        controls={(controls) => <ShellTableControls {...controls} />}
        selected={(row) => row.id === editing}
        hidden={phone ? ON_PHONE : article ? BESIDE_PANEL : []}
        caption={
          <span className="text-muted-foreground text-sm tabular-nums">
            {[
              `${rows.length} ${rows.length === 1 ? "article" : "articles"}`,
              filterNote,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        }
      />
      {article && (
        <RowDetails>
          <ArticlePanel
            key={article.id}
            article={article}
            archive={archive}
            onClose={openRow.close}
          />
        </RowDetails>
      )}
    </OpenRowProvider>
  );
}

function ArticlePanel({
  article,
  archive,
  onClose,
}: {
  article: ArchiveArticle;
  archive: Archive;
  onClose: () => void;
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
    <SidePanel title={article.title} back="All articles" onClose={onClose}>
      <div className="-mt-3 space-y-3">
        <p className="text-muted-foreground text-xs">
          {formatDate(article.publishedAt)} ·{" "}
          <SectionName section={article.section} />
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={article.link}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            View <ExternalLinkIcon />
          </a>
          <a
            href={EDIT_IN_WORDPRESS(article.id)}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Edit in WordPress <ExternalLinkIcon />
          </a>
        </div>
      </div>
      {ROLES.map((role) => (
        <RoleEditor
          /* a save changes the contributors, which starts the form afresh */
          key={`${article.id}-${role}-${JSON.stringify(
            article.credits
              .filter((c) => c.role === role)
              .map((c) => c.contributors),
          )}`}
          article={article}
          role={role}
          everyone={everyone}
        />
      ))}
    </SidePanel>
  );
}

/* the article's own rows for one role, as a form describes them */
const entriesOf = ({
  renamed,
  added,
}: {
  renamed: Record<string, string>;
  added: string[];
}) => [
  ...Object.entries(renamed)
    .filter(([, name]) => name.trim())
    .map(([byline, realName]) => ({ byline, realName })),
  ...added
    .filter((name) => name.trim())
    .map((realName) => ({ byline: null, realName })),
];

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
  const ids = useId();
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
    <section className="space-y-3 border-t pt-4">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{ROLE_NAMES[role]}</h3>
        {credits[0]?.printed && (
          <p className="text-muted-foreground text-xs break-words">
            {credits[0].label}: {credits.map((c) => c.printed).join(" / ")}
          </p>
        )}
      </div>

      {printed.length === 0 && added.length === 0 && (
        <p className="text-muted-foreground text-sm">No credit line.</p>
      )}

      <FieldRows>
        {printed.map((byline, index) => (
          <FieldRow
            key={byline}
            label={<span className="break-words">{byline}</span>}
            htmlFor={`${ids}-${index}`}
            width="panel"
          >
            <Input
              id={`${ids}-${index}`}
              list={list}
              aria-label={`Who ${byline} counts as`}
              value={renamed[byline] ?? ""}
              placeholder={
                fallback(byline) === byline ? "Unchanged" : fallback(byline)
              }
              onChange={(event) =>
                setRenamed({ ...renamed, [byline]: event.target.value })
              }
            />
          </FieldRow>
        ))}
        {added.map((name, index) => (
          <FieldRow
            key={index}
            label={
              <span className="text-muted-foreground font-normal italic">
                Not printed
              </span>
            }
            htmlFor={`${ids}-added-${index}`}
            width="panel"
            action={
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                aria-label={`Remove ${name || "this name"}`}
                onClick={() => setAdded(added.filter((_, i) => i !== index))}
              >
                <XIcon />
              </Button>
            }
          >
            <Input
              id={`${ids}-added-${index}`}
              list={list}
              value={name}
              placeholder="Name"
              onChange={(event) =>
                setAdded(
                  added.map((n, i) => (i === index ? event.target.value : n)),
                )
              }
            />
          </FieldRow>
        ))}
      </FieldRows>
      <datalist id={list}>
        {everyone.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          className="-ml-2.5"
          onClick={() => setAdded([...added, ""])}
        >
          <PlusIcon /> Add someone not printed
        </Button>
        <span className="flex-1" />
        {!changed &&
          (initial.added.length > 0 ||
            Object.values(initial.renamed).some(Boolean)) && (
            <Button
              variant="ghost"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  edit: {
                    kind: "article-credits",
                    postId: article.id,
                    role,
                    entries: [],
                  },
                  done: `“${article.title}” is back to its printed bylines`,
                  undo: {
                    kind: "article-credits",
                    postId: article.id,
                    role,
                    entries: entriesOf(initial),
                  },
                })
              }
            >
              Reset to printed
            </Button>
          )}
        {changed && (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRenamed(initial.renamed);
                setAdded(initial.added);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  edit: {
                    kind: "article-credits",
                    postId: article.id,
                    role,
                    entries: entriesOf({ renamed, added }),
                  },
                  done: SAVED[role](article.title),
                  undo: {
                    kind: "article-credits",
                    postId: article.id,
                    role,
                    entries: entriesOf(initial),
                  },
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

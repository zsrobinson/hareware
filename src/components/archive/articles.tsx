import type { ColumnDef } from "@tanstack/react-table";
import {
  ExternalLinkIcon,
  PlusIcon,
  RotateCcwIcon,
  UserRoundIcon,
  UserRoundPlusIcon,
  XIcon,
} from "lucide-react";
import { Fragment, useId, useMemo, useState, type ReactNode } from "react";
import { DataTable, sortable } from "~/components/data-table";
import { FieldNote, FieldRow, FieldRows } from "~/components/field-row";
import { SidePanel, useIsPhone, useRoomBesidePanel } from "~/components/panel";
import { Button, buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  pastUsesOn,
  PROBLEM_KINDS,
  type Archive,
  type ArchiveArticle,
  type Credit,
  type ProblemKind,
} from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Role } from "~/lib/credits/labels";
import { contributionsOn, peopleOf } from "~/lib/credits/person";
import { same } from "~/lib/credits/sheet";
import { applyFilters, easternDate } from "~/lib/credits/stats";
import { useShowsViews, useTrail } from "./archive-shell";
import { ExplorerPage, type TableViewProps } from "./explorer";
import { ViewHeading } from "./view-heading";
import { formatDate } from "./dates";
import { PeoplePicker, PersonPicker, QUIET } from "./person-picker";
import {
  archiveHref,
  OpenRowProvider,
  personHref,
  RowDetails,
  RowOpener,
} from "./open-row";
import { SectionName } from "./section-name";
import { ShellTableControls } from "./table-controls";
import { useEdit } from "./use-edit";
import { COLUMN_NAMES, type ColumnId } from "./views";
import { ThinViews } from "./views-notes";

const EDIT_IN_WORDPRESS = (id: number) =>
  `https://theumdhare.com/wp-admin/post.php?post=${id}&action=edit`;

export function ArticlesPage() {
  return <ExplorerPage source="articles" table={Articles} />;
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
  const trail = useTrail();
  const people = credits.flatMap((credit) => credit.contributors);
  if (people.length === 0)
    return <span className="text-muted-foreground/50">—</span>;
  return (
    <div className="space-y-0.5">
      {people.map((person, index) => (
        <div key={index}>
          <a
            href={personHref(person.name, trail)}
            className="underline-offset-4 hover:underline"
          >
            {person.name}
          </a>
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

/* the article on Problems, on these filters; a component of its own, so the
   columns need not change with them (see open-row.tsx) */
function ProblemsLink({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const trail = useTrail();
  return (
    <a
      href={archiveHref("problems", {
        ...trail,
        state: { ...trail.state, search: title },
      })}
      className="text-muted-foreground block text-xs hover:underline"
    >
      {children}
    </a>
  );
}

/* what a narrower table leaves out until someone asks for it, so none of
   it is cut off at the edge: beside a panel on a smaller laptop, and on a
   phone */
const BESIDE_PANEL = ["section", "image", "other", "words"];

/* the column whose "—" already says a credit is missing */
const CREDIT_COLUMN: Partial<Record<ProblemKind, Role>> = {
  "no-writer": "writer",
  "no-image": "image",
};
/* a phone writes the date under the title, unless the table is sorted by it */
const ON_PHONE = ["date", "writer", ...BESIDE_PANEL];

/* every column a view of articles can show, by its id in ./views; none
   depends on which row is open (see open-row.tsx) */
const EVERY_COLUMN: ColumnDef<ArchiveArticle, unknown>[] = [
  {
    id: "date",
    accessorFn: (article) => easternDate(article.publishedAt),
    header: sortable(COLUMN_NAMES.date),
    meta: { csvHeader: COLUMN_NAMES.date },
    cell: ({ row }) => (
      <span className="text-muted-foreground whitespace-nowrap tabular-nums">
        {formatDate(row.original.publishedAt)}
      </span>
    ),
  },
  {
    id: "title",
    accessorKey: "title",
    header: sortable(COLUMN_NAMES.title),
    meta: { csvHeader: COLUMN_NAMES.title },
    cell: ({ row, table }) => {
      /* a missing credit shows as "—" in its column; named here only
           where that column is hidden (a phone, or beside a panel) */
      const said = (kind: ProblemKind) => {
        const column = CREDIT_COLUMN[kind];
        return !column || !table.getColumn(column)?.getIsVisible();
      };
      const problems = row.original.ignored
        ? []
        : row.original.problems.filter((p) => said(p.kind));
      const dated = !table.getColumn("date")?.getIsVisible();
      return (
        /* fits beside the date on a phone-wide window that shows a
             scrollbar, so the table only scrolls when it must */
        <div className="max-w-md min-w-52 whitespace-normal">
          <RowOpener rowKey={String(row.original.id)} className="font-medium">
            {row.original.title}
          </RowOpener>
          {dated && (
            <div className="text-muted-foreground text-xs tabular-nums">
              {formatDate(row.original.publishedAt)}
              {!table.getColumn("section")?.getIsVisible() && (
                <>
                  {" · "}
                  <SectionName section={row.original.section} />
                </>
              )}
            </div>
          )}
          {problems.length > 0 && (
            <ProblemsLink title={row.original.title}>
              {problems.map((p) => PROBLEM_KINDS[p.kind]).join(" · ")}
            </ProblemsLink>
          )}
        </div>
      );
    },
  },
  {
    id: "section",
    accessorKey: "section",
    header: sortable(COLUMN_NAMES.section),
    meta: { csvHeader: COLUMN_NAMES.section },
    cell: ({ row }) => <SectionName section={row.original.section} />,
  },
  ...ROLES.map((role): ColumnDef<ArchiveArticle, unknown> => ({
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
  })),
  {
    id: "words",
    accessorKey: "words",
    header: sortable(COLUMN_NAMES.words, "right"),
    meta: { csvHeader: COLUMN_NAMES.words },
    sortDescFirst: true,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {row.original.words.toLocaleString()}
      </div>
    ),
  },
  {
    id: "views",
    /* unavailable is no number: blank in a CSV, last in a sort, and never
       read as zero */
    accessorFn: (article) =>
      article.views.status === "counted" ? article.views.total : undefined,
    sortUndefined: "last",
    sortDescFirst: true,
    header: sortable(COLUMN_NAMES.views, "right"),
    meta: { csvHeader: COLUMN_NAMES.views },
    cell: ({ row }) => {
      const { views } = row.original;
      return views.status === "counted" ? (
        <div className="text-right tabular-nums">
          {views.total.toLocaleString()}
        </div>
      ) : (
        <div
          className="text-muted-foreground text-right"
          title="Views unavailable"
        >
          <span aria-hidden>–</span>
          <span className="sr-only">Views unavailable</span>
        </div>
      );
    },
  },
];
const DEFS = Object.fromEntries(
  EVERY_COLUMN.map((column) => [column.id, column]),
) as Record<ColumnId<"articles">, ColumnDef<ArchiveArticle, unknown>>;

function Articles({
  archive,
  filters,
  filterNote,
  heading,
  columns: shown,
  sorting: held,
  setSorting,
  opened: openRow,
  picked,
  setPicked,
}: TableViewProps) {
  const phone = useIsPhone();
  const roomy = useRoomBesidePanel();
  const editing = openRow.open === null ? null : Number(openRow.open);

  const rows = useMemo(
    () => applyFilters(archive.articles, filters),
    [archive, filters],
  );

  /* "other" credits are rare, so a view seldom shows their column; it
     joins one whenever the Roles filter asks for them */
  const anyOther = filters.roles.includes("other");
  const columns = useMemo(
    () =>
      (anyOther && !shown.includes("other") ? [...shown, "other"] : shown)
        .filter((id): id is ColumnId<"articles"> => id in DEFS)
        .map((id) => DEFS[id]),
    [shown, anyOther],
  );
  useShowsViews(columns.some((column) => column.id === "views"));
  /* a sort on a column this table does not show now is held, and comes
     back with it; so is one by views until there are views to sort by,
     the newest first meanwhile, which the caption says */
  const viewsAwait =
    archive.views.status !== "read" && held.some((by) => by.id === "views");
  const sorting = viewsAwait
    ? [{ id: "date", desc: true }]
    : held.filter((by) => columns.some((column) => column.id === by.id));

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
        sorting={sorting}
        onSortingChange={setSorting}
        picked={picked}
        onPickedChange={setPicked}
        controls={(controls) => <ShellTableControls {...controls} />}
        selected={(row) => row.id === editing}
        /* the column a table is sorted by is never one it leaves out */
        hidden={(phone
          ? ON_PHONE
          : article && !roomy
            ? BESIDE_PANEL
            : []
        ).filter((id) => id !== sorting[0]?.id)}
        caption={
          <ViewHeading
            title={heading.title}
            question={heading.question}
            count={[
              `${rows.length} ${rows.length === 1 ? "article" : "articles"}`,
              filterNote,
              viewsAwait && "Sorted by date until views load",
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            {shown.includes("views") && (
              <ThinViews articles={rows} summary={archive.views} />
            )}
          </ViewHeading>
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

export function ArticlePanel({
  article,
  archive,
  onClose,
}: {
  article: ArchiveArticle;
  archive: Archive;
  onClose: () => void;
}) {
  const everyone = useMemo(
    () => [...peopleOf(archive.articles).keys()].sort(),
    [archive],
  );

  return (
    <SidePanel title={article.title} back="All articles" onClose={onClose}>
      <div className="-mt-3 space-y-3">
        <p className="text-muted-foreground text-xs">
          {formatDate(article.publishedAt)} ·{" "}
          <SectionName section={article.section} />
        </p>
        <Credited article={article} />
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
          archive={archive}
        />
      ))}
    </SidePanel>
  );
}

/** who the article counts, by role, each a link to their record */
function Credited({ article }: { article: ArchiveArticle }) {
  const trail = useTrail();
  const roles = ROLES.map((role) => ({
    role,
    names: [
      ...new Set(
        contributionsOn(article)
          .filter((c) => c.role === role)
          .map((c) => c.person),
      ),
    ],
  })).filter(({ names }) => names.length > 0);
  if (roles.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {roles.map(({ role, names }) => (
        <Fragment key={role}>
          <dt className="text-muted-foreground">{ROLE_NAMES[role]}</dt>
          <dd>
            {names.map((name, index) => (
              <Fragment key={name}>
                {index > 0 && ", "}
                <a
                  href={personHref(name, trail)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {name}
                </a>
              </Fragment>
            ))}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/* the article's own rows for one role, as a form describes them */
const entriesOf = ({
  renamed,
  added,
}: {
  renamed: Record<string, string[]>;
  added: string[];
}) => [
  ...Object.entries(renamed).flatMap(([byline, names]) =>
    names
      .filter((name) => name.trim())
      .map((realName) => ({ byline, realName })),
  ),
  ...added
    .filter((name) => name.trim())
    .map((realName) => ({ byline: null, realName })),
];

/**
 * One role's contributors on one article: each printed name, who it counts
 * as, and anyone added who is not printed. Saving writes this article's rows
 * for the role and nothing else. A byline that was someone on other articles
 * offers that person, but only says so: a pen name can change hands.
 */
function RoleEditor({
  article,
  role,
  everyone,
  archive,
}: {
  article: ArchiveArticle;
  role: Role;
  everyone: string[];
  archive: Archive;
}) {
  const save = useEdit();
  const ids = useId();
  const credits = article.credits.filter((c) => c.role === role);
  const printed = credits.flatMap((c) => c.bylines);
  const people = credits.flatMap((c) => c.contributors);

  /* what this article's own rows say now, as the form's starting point */
  const initial = {
    renamed: Object.fromEntries(
      printed.map((byline) => [
        byline,
        people
          .filter(
            (p) => p.source === "article" && p.byline && same(p.byline, byline),
          )
          .map((p) => p.name),
      ]),
    ),
    added: people
      .filter((p) => p.source === "article" && !p.byline)
      .map((p) => p.name),
  };
  const [renamed, setRenamed] = useState<Record<string, string[]>>(
    initial.renamed,
  );
  /* where else the article prints each byline, so a save can split a row
     that held for any role instead of leaving it beside the new ones */
  const elsewhere = printed.map((byline) => ({
    byline,
    roles: article.credits
      .filter((c) => c.role !== role && c.bylines.some((b) => same(b, byline)))
      .map((c) => c.role),
  }));
  const [added, setAdded] = useState<string[]>(initial.added);
  const changed =
    JSON.stringify({ renamed, added }) !== JSON.stringify(initial);

  if (printed.length === 0 && added.length === 0 && role === "other")
    return null;

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
        {printed.map((byline, index) => {
          /* who the byline was on other articles, while nothing is chosen */
          const chosen = renamed[byline] ?? [];
          const before =
            chosen.length > 0
              ? []
              : pastUsesOn(archive, byline, article.id).filter(
                  (use) => !same(use.name, byline),
                );
          return (
            <Fragment key={byline}>
              <FieldRow
                icon={UserRoundIcon}
                label={
                  <>
                    Counts as
                    {/* which printed name, where the line prints more than one */}
                    {printed.length > 1 && (
                      <span className="text-muted-foreground block text-xs font-normal break-words">
                        {byline}
                      </span>
                    )}
                  </>
                }
                htmlFor={`${ids}-${index}`}
                width="panel"
                top={printed.length > 1}
              >
                <PeoplePicker
                  id={`${ids}-${index}`}
                  value={chosen}
                  onChange={(names) =>
                    setRenamed({ ...renamed, [byline]: names })
                  }
                  people={everyone}
                  none="Themselves"
                />
              </FieldRow>
              {before.length > 0 && (
                <FieldNote width="panel">
                  {/* the two it was most, as Problems words it: each fills
                      the picker, and "not this time" says it is the byline */}
                  Was{" "}
                  {before.slice(0, 2).map((use, i) => (
                    <span key={use.name}>
                      {i > 0 && ", "}
                      <button
                        type="button"
                        className="hover:text-foreground underline underline-offset-4"
                        onClick={() =>
                          setRenamed({ ...renamed, [byline]: [use.name] })
                        }
                      >
                        {use.name}
                      </button>{" "}
                      on {use.postIds.length}
                      {i === 0 &&
                        (use.postIds.length === 1 ? " article" : " articles")}
                    </span>
                  ))}
                  .{" "}
                  <button
                    type="button"
                    className="hover:text-foreground underline underline-offset-4"
                    onClick={() =>
                      setRenamed({ ...renamed, [byline]: [byline] })
                    }
                  >
                    Not a pen name here
                  </button>
                </FieldNote>
              )}
            </Fragment>
          );
        })}
        {added.map((name, index) => (
          <FieldRow
            key={index}
            icon={UserRoundPlusIcon}
            label="Not printed"
            htmlFor={`${ids}-added-${index}`}
            width="panel"
            /* the name is what matters, so it has the room the label had */
            wide
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
            <PersonPicker
              id={`${ids}-added-${index}`}
              value={name}
              onChange={(next) =>
                setAdded(added.map((n, i) => (i === index ? next : n)))
              }
              people={everyone}
              placeholder="Someone not printed"
            />
          </FieldRow>
        ))}
      </FieldRows>

      {/* the panel's actions are one quiet kind, their icons on the
          rows' icon column; Reset, which undoes the Sheet's, is quieter
          still and has a line of its own */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className={QUIET}
          onClick={() => setAdded([...added, ""])}
        >
          <PlusIcon /> Add someone not printed
        </Button>
        <span className="flex-1" />
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
                    elsewhere,
                  },
                  done: SAVED[role](article.title),
                  undo: {
                    kind: "article-credits",
                    postId: article.id,
                    role,
                    entries: entriesOf(initial),
                    elsewhere,
                  },
                })
              }
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        )}
      </div>
      {!changed &&
        (initial.added.length > 0 ||
          Object.values(initial.renamed).some((names) => names.length > 0)) && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className={cn(QUIET, "text-muted-foreground/80")}
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  edit: {
                    kind: "article-credits",
                    postId: article.id,
                    role,
                    entries: [],
                    elsewhere,
                  },
                  done: `“${article.title}” is back to its printed bylines`,
                  undo: {
                    kind: "article-credits",
                    postId: article.id,
                    role,
                    entries: entriesOf(initial),
                    elsewhere,
                  },
                })
              }
            >
              <RotateCcwIcon /> Reset to printed
            </Button>
          </div>
        )}
    </section>
  );
}

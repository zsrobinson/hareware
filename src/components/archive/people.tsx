import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable, sortable } from "~/components/data-table";
import { ExternalLinkIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { ROLE_NAMES } from "~/lib/credits/labels";
import type { ArchiveArticle } from "~/lib/credits/archive";
import { applyFilters, people, type PersonRow } from "~/lib/credits/stats";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { Choice } from "./choice";
import { formatDate, formatMonth } from "./dates";

export function PeoplePage() {
  return (
    <ArchiveShell searchPlaceholder="A person's name">
      {(props) => <People {...props} />}
    </ArchiveShell>
  );
}

/** a number column, right-aligned so the digits line up */
const count = (
  id: "articles" | "writer" | "image" | "other",
  label: string,
): ColumnDef<PersonRow, unknown> => ({
  id,
  accessorFn: (row) => (id === "articles" ? row.articles : row.counts[id]),
  header: ({ column }) => (
    <div className="flex justify-end">{sortable(label)({ column })}</div>
  ),
  meta: { csvHeader: label },
  cell: ({ getValue }) => {
    const value = getValue() as number;
    return (
      <div
        className={
          value === 0
            ? "text-muted-foreground/50 text-right tabular-nums"
            : "text-right tabular-nums"
        }
      >
        {value}
      </div>
    );
  },
});

function People({ archive, filters }: ViewProps) {
  const [minimum, setMinimum] = useState("1");
  const [open, setOpen] = useState<string | null>(null);

  /* the search box here looks for a person, not for words in their articles */
  const rows = useMemo(() => {
    const search = filters.search?.trim().toLowerCase();
    const shown = applyFilters(archive.articles, {
      ...filters,
      search: undefined,
    });
    return people(shown, filters).filter(
      (row) =>
        row.articles >= Number(minimum) &&
        (!search ||
          [row.name, ...row.aliases].some((name) =>
            name.toLowerCase().includes(search),
          )),
    );
  }, [archive, filters, minimum]);
  const byId = useMemo(
    () => new Map(archive.articles.map((a) => [a.id, a])),
    [archive],
  );

  const columns = useMemo<ColumnDef<PersonRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: sortable("Name"),
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left hover:underline"
            aria-expanded={open === row.original.name}
            onClick={() =>
              setOpen(open === row.original.name ? null : row.original.name)
            }
          >
            <span className="font-medium">{row.original.name}</span>
            {row.original.aliases.length > 0 && (
              <span className="text-muted-foreground block text-xs">
                as {row.original.aliases.join(", ")}
              </span>
            )}
          </button>
        ),
      },
      count("articles", "Articles"),
      count("writer", "Writing"),
      count("image", "Images"),
      count("other", "Other"),
      {
        accessorKey: "first",
        header: sortable("First"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatMonth(row.original.first)}
          </span>
        ),
      },
      {
        accessorKey: "last",
        header: sortable("Latest"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatMonth(row.original.last)}
          </span>
        ),
      },
    ],
    [open],
  );

  const selected = open ? rows.find((row) => row.name === open) : undefined;

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={rows}
        searchable={false}
        empty="Nobody is credited with these filters."
        csv="people"
        toolbar={
          <>
            <Choice
              label="Minimum articles"
              hideLabel
              width="w-48"
              value={minimum}
              options={["1", "2", "3", "5", "10"].map((n) => ({
                id: n,
                label: n === "1" ? "Everyone" : `${n}+ articles`,
              }))}
              onChange={setMinimum}
            />
            <span className="text-muted-foreground text-sm">
              <span className="text-foreground font-medium">{rows.length}</span>{" "}
              people
            </span>
          </>
        }
      />
      <p className="text-muted-foreground text-xs">
        Articles counts each article once. Writing, Images and Other count
        credits, so someone who wrote and illustrated one article has one in
        each.
      </p>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && <PersonArticles person={selected} byId={byId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PersonArticles({
  person,
  byId,
}: {
  person: PersonRow;
  byId: Map<number, ArchiveArticle>;
}) {
  const articles = person.articleIds
    .map((id) => byId.get(id))
    .filter((article): article is ArchiveArticle => Boolean(article));
  return (
    <>
      <SheetHeader>
        <SheetTitle>{person.name}</SheetTitle>
        <SheetDescription>
          {articles.length} {articles.length === 1 ? "article" : "articles"}{" "}
          with these filters:{" "}
          {(["writer", "image", "other"] as const)
            .filter((role) => person.counts[role] > 0)
            .map(
              (role) =>
                `${person.counts[role]} ${ROLE_NAMES[role].toLowerCase()}`,
            )
            .join(" · ")}
          {person.aliases.length > 0 && (
            <> · printed as {person.aliases.join(", ")}</>
          )}
        </SheetDescription>
      </SheetHeader>
      <ul className="divide-y px-4 pb-4 text-sm">
        {articles.map((article) => {
          const roles = article.credits
            .filter((credit) => credit.names.includes(person.name))
            .map((credit) => ROLE_NAMES[credit.role]);
          return (
            <li key={article.id} className="space-y-0.5 py-2.5">
              <a
                href={article.link}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline-offset-2 hover:underline"
              >
                {article.title}
                <ExternalLinkIcon className="text-muted-foreground ml-1 inline size-3 align-baseline" />
              </a>
              <p className="text-muted-foreground text-xs">
                {formatDate(article.publishedAt)} · {article.section} ·{" "}
                {[...new Set(roles)].join(", ")}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

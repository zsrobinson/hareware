import type { ColumnDef } from "@tanstack/react-table";
import { UsersRoundIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable, sortable } from "~/components/data-table";
import { SidePanel, useIsPhone } from "~/components/panel";
import {
  bylineKey,
  type Archive,
  type ArchiveArticle,
} from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Role } from "~/lib/credits/labels";
import { sortSections } from "~/lib/credits/sections";
import {
  applyFilters,
  NO_FILTERS,
  people,
  searchable,
  type Filters,
  type PersonRow,
} from "~/lib/credits/stats";
import { ArchiveShell, ToolbarFilters, type ViewProps } from "./archive-shell";
import { Choice } from "./choice";
import { formatDate, formatMonth } from "./dates";
import {
  articleHref,
  OpenRowProvider,
  RowDetails,
  RowOpener,
  useOpenRow,
} from "./open-row";
import { SectionName } from "./section-name";
import { ShellTableControls } from "./table-controls";

export function PeoplePage() {
  return (
    <ArchiveShell searchPlaceholder="Search">
      {(props) => <People {...props} />}
    </ArchiveShell>
  );
}

/** a number column, right-aligned so the digits line up */
const count = (
  id: "contributions" | Role,
  label: string,
  title?: string,
): ColumnDef<PersonRow, unknown> => ({
  id,
  accessorFn: (row) =>
    id === "contributions" ? row.contributions : row.counts[id],
  header: ({ column }) => (
    <div className="flex justify-end" title={title}>
      {sortable(label, "right")({ column })}
    </div>
  ),
  meta: { csvHeader: label },
  cell: ({ getValue }) => {
    const value = getValue() as number;
    return (
      <div
        className={
          value === 0
            ? "text-muted-foreground/40 text-right tabular-nums"
            : "text-right tabular-nums"
        }
      >
        {value}
      </div>
    );
  },
});

const MINIMUMS = ["1", "2", "3", "5", "10"].map((n) => ({
  id: n,
  label: n === "1" ? "All people" : `${n}+ contributions`,
}));

/* never depend on which row is open, so its name is never redrawn as a new
   button (see open-row.tsx) */
const COLUMNS: ColumnDef<PersonRow, unknown>[] = [
  {
    accessorKey: "name",
    header: sortable("Name"),
    meta: { csvHeader: "Name" },
    cell: ({ row }) => (
      <RowOpener rowKey={row.original.name}>
        <span className="font-medium">{row.original.name}</span>
        {row.original.bylines.length > 0 && (
          <span className="text-muted-foreground block text-xs">
            as {row.original.bylines.join(", ")}
          </span>
        )}
      </RowOpener>
    ),
  },
  count(
    "contributions",
    "Contributions",
    "One per person, per role, per article",
  ),
  count("writer", ROLE_NAMES.writer),
  count("image", ROLE_NAMES.image),
  count("other", ROLE_NAMES.other),
  {
    accessorKey: "first",
    header: sortable("First"),
    meta: { csvHeader: "First" },
    cell: ({ row }) => (
      <span className="text-muted-foreground whitespace-nowrap">
        {formatMonth(row.original.first)}
      </span>
    ),
  },
  {
    accessorKey: "last",
    header: sortable("Latest"),
    meta: { csvHeader: "Latest" },
    cell: ({ row }) => (
      <span className="text-muted-foreground whitespace-nowrap">
        {formatMonth(row.original.last)}
      </span>
    ),
  },
];

/* what a narrower table leaves out until someone asks for it, so none of
   it is cut off at the edge: beside a panel, and on a phone */
const BESIDE_PANEL = ["other", "first", "last"];
const ON_PHONE = ["writer", "image", ...BESIDE_PANEL];

/**
 * what the filters narrow a count to, as words after it: "in News in the last
 * 3 months". Empty when only a role is chosen, which the count's breakdown
 * names, and when nothing is
 */
function scopeOf(filters: Filters, filterNote: string): string {
  const parts: string[] = [];
  const { sections, from, to } = filters;
  if (sections.length > 0)
    parts.push(
      sections.length <= 2
        ? `in ${sortSections(sections).join(" and ")}`
        : `in ${sections.length} sections`,
    );
  /* the Time filter's own name leads the caption's note */
  const time = from || to ? filterNote.split(" · ")[0]! : "";
  if (/^Last \d/.test(time)) parts.push(`in the ${time.toLowerCase()}`);
  else if (/^(This|Last) /.test(time)) parts.push(time.toLowerCase());
  else if (from && to)
    parts.push(`from ${formatDate(from)} to ${formatDate(to)}`);
  else if (from) parts.push(`since ${formatDate(from)}`);
  else if (to) parts.push(`until ${formatDate(to)}`);
  return parts.join(" ");
}

function People({ archive, filters, filterNote }: ViewProps) {
  const phone = useIsPhone();
  const [minimum, setMinimum] = useState("1");
  const openRow = useOpenRow("person");
  const { open } = openRow;

  /* names to suggest and check against ignore the filters: a person is
     still credited when this semester or section leaves them out */
  const everybody = useMemo(
    () => people(archive.articles, NO_FILTERS),
    [archive],
  );

  /* the search box here looks for a person or a byline they use. First and
     Latest are a person's own, whatever the filters: under "Last 3 months"
     the first credit in range would read as when they joined */
  const all = useMemo(() => {
    const span = new Map(everybody.map((row) => [row.name, row]));
    return people(
      applyFilters(archive.articles, { ...filters, search: undefined }),
      filters,
    ).map((row) => {
      const own = span.get(row.name);
      return own ? { ...row, first: own.first, last: own.last } : row;
    });
  }, [archive, filters, everybody]);
  const rows = useMemo(() => {
    const search = filters.search?.trim() ? searchable(filters.search) : "";
    return all.filter(
      (row) =>
        row.contributions >= Number(minimum) &&
        (!search ||
          [row.name, ...row.bylines].some((name) =>
            searchable(name).includes(search),
          )),
    );
  }, [all, filters.search, minimum]);

  /* the panel counts what the filters leave, and says so, beside the whole */
  const inRange = open ? all.find((row) => row.name === open) : undefined;
  const whole = open ? everybody.find((row) => row.name === open) : undefined;
  const selected = inRange ?? whole;
  const narrowed =
    Boolean(filters.from || filters.to) ||
    filters.sections.length > 0 ||
    filters.roles.length > 0;

  const show = (
    <Choice
      label="Show"
      hideLabel
      width={phone ? "w-full justify-between" : "w-fit"}
      value={minimum}
      options={MINIMUMS}
      onChange={setMinimum}
    />
  );

  return (
    <OpenRowProvider value={openRow}>
      {/* a filter like the shell's, so it sits among them */}
      <ToolbarFilters label="Show" icon={UsersRoundIcon}>
        {show}
      </ToolbarFilters>
      <DataTable
        columns={COLUMNS}
        data={rows}
        searchable={false}
        empty="Nobody matches these filters."
        csv="people"
        controls={(controls) => <ShellTableControls {...controls} />}
        selected={(row) => row.name === open}
        hidden={phone ? ON_PHONE : selected ? BESIDE_PANEL : []}
        caption={
          <span className="text-muted-foreground text-sm tabular-nums">
            {[
              `${rows.length} ${rows.length === 1 ? "person" : "people"}`,
              filterNote,
              minimum !== "1" && `${minimum}+ contributions`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        }
      />

      {selected && (
        <RowDetails>
          <PersonPanel
            key={selected.name}
            person={selected}
            counted={
              narrowed
                ? {
                    inRange: inRange?.contributions ?? 0,
                    scope: scopeOf(filters, filterNote),
                    inAll: whole?.contributions ?? selected.contributions,
                  }
                : null
            }
            archive={archive}
            onClose={openRow.close}
          />
        </RowDetails>
      )}
    </OpenRowProvider>
  );
}

function PersonPanel({
  person,
  counted,
  archive,
  onClose,
}: {
  person: PersonRow;
  /** under filters: the count they leave, in what words, and the whole */
  counted: { inRange: number; scope: string; inAll: number } | null;
  archive: Archive;
  onClose: () => void;
}) {
  const byId = new Map(archive.articles.map((a) => [a.id, a]));
  const articles = person.articleIds
    .map((id) => byId.get(id))
    .filter((a): a is ArchiveArticle => Boolean(a))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  /* the bylines an article's own row credits them through, in contributions */
  const bylines = new Map<string, { byline: string; contributions: number }>();
  for (const article of articles)
    for (const credit of article.credits)
      for (const c of credit.contributors)
        if (c.name === person.name && c.byline) {
          const key = bylineKey(c.byline);
          const entry = bylines.get(key) ?? {
            byline: c.byline,
            contributions: 0,
          };
          entry.contributions += 1;
          bylines.set(key, entry);
        }
  const creditedAs = [...bylines.values()].sort(
    (a, b) =>
      b.contributions - a.contributions || a.byline.localeCompare(b.byline),
  );

  const contributions = counted ? counted.inRange : person.contributions;
  /* someone the filters leave out still opens, on their whole record */
  const summary =
    contributions === 0
      ? ""
      : ROLES.filter((role) => person.counts[role] > 0)
          .map(
            (role) =>
              `${person.counts[role]} ${ROLE_NAMES[role].toLowerCase()}`,
          )
          .join(", ");

  return (
    <SidePanel title={person.name} back="All people" onClose={onClose}>
      <p className="text-muted-foreground -mt-3 text-xs">
        {contributions === 0 ? "No" : contributions}{" "}
        {contributions === 1 ? "contribution" : "contributions"}
        {counted?.scope && <> {counted.scope}</>}
        {summary && <> ({summary})</>}
        <span className="block">
          {counted && (
            <>
              {counted.inAll}{" "}
              {counted.inAll === 1 ? "contribution" : "contributions"} in all
              ·{" "}
            </>
          )}
          {formatMonth(person.first)}
          {person.first.slice(0, 7) !== person.last.slice(0, 7) && (
            <> – {formatMonth(person.last)}</>
          )}
        </span>
      </p>

      {creditedAs.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-muted-foreground text-xs font-medium">
            Credited as
          </h3>
          <ul className="text-sm">
            {creditedAs.map((use) => (
              <li key={use.byline}>
                {use.byline}
                <span className="text-muted-foreground tabular-nums">
                  {" "}
                  · {use.contributions}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-1">
        <h3 className="text-muted-foreground text-xs font-medium">Latest</h3>
        <ul className="divide-y text-sm">
          {articles.map((article) => {
            const roles = article.credits
              .filter((c) => c.contributors.some((p) => p.name === person.name))
              .map((c) => ROLE_NAMES[c.role]);
            const as = article.credits
              .flatMap((c) => c.contributors)
              .find((p) => p.name === person.name && p.byline)?.byline;
            return (
              <li key={article.id} className="space-y-0.5 py-2.5">
                {/* the article's panel, where its credits are set */}
                <a
                  href={articleHref(article.id)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {article.title}
                </a>
                <p className="text-muted-foreground text-xs">
                  {formatDate(article.publishedAt)} ·{" "}
                  <SectionName section={article.section} /> ·{" "}
                  {[...new Set(roles)].join(", ")}
                  {as && <> · as {as}</>}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </SidePanel>
  );
}

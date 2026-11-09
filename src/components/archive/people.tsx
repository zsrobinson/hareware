import type { ColumnDef } from "@tanstack/react-table";
import { UsersRoundIcon } from "lucide-react";
import { useMemo } from "react";
import { DataTable, sortable } from "~/components/data-table";
import { SidePanel, useIsPhone, useRoomBesidePanel } from "~/components/panel";
import { ROLE_NAMES, ROLES, type Role } from "~/lib/credits/labels";
import { peopleOf, type Contribution, type Person } from "~/lib/credits/person";
import { sortSections } from "~/lib/credits/sections";
import {
  applyFilters,
  easternDate,
  people,
  periodBounds,
  periodOf,
  periodsOf,
  searchable,
  type PersonRow,
} from "~/lib/credits/stats";
import { ToolbarFilters, useTrail } from "./archive-shell";
import { counted } from "./chart-slice";
import { Choice } from "./choice";
import { ExplorerPage, type TableViewProps } from "./explorer";
import { ViewHeading } from "./view-heading";
import { formatDate, formatMonth } from "./dates";
import { isRolling, periodNamed, PRESETS, type FilterState } from "./filters";
import {
  articleHref,
  OpenRowProvider,
  RowDetails,
  RowOpener,
} from "./open-row";
import { SectionName } from "./section-name";
import { EDITED } from "./edited";
import { ShellTableControls } from "./table-controls";
import { COLUMN_NAMES, MINIMUMS, type ColumnId, type Minimum } from "./views";

export function PeoplePage() {
  return <ExplorerPage source="people" table={People} />;
}

/** a number column, right-aligned so the digits line up */
const count = (
  id: "contributions" | Role,
  title?: string,
): ColumnDef<PersonRow, unknown> => {
  const label = COLUMN_NAMES[id];
  return {
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
  };
};

const SHOWS = MINIMUMS.map((n) => ({
  id: String(n),
  label: n === 1 ? "All people" : `${n}+ contributions`,
}));

/* every column a view of people can show, by its id in ./views. None
   depends on which row is open, so its name is never redrawn as a new
   button (see open-row.tsx) */
const EVERY_COLUMN: ColumnDef<PersonRow, unknown>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: sortable(COLUMN_NAMES.name),
    meta: { csvHeader: COLUMN_NAMES.name },
    cell: ({ row, table }) => {
      /* a date the table is sorted by but has no room for, as on a phone */
      const by = table.getState().sorting[0]?.id;
      const date =
        (by === "first" || by === "last") &&
        !table.getColumn(by)?.getIsVisible()
          ? by
          : null;
      return (
        <RowOpener rowKey={row.original.name}>
          <span className="font-medium">{row.original.name}</span>
          {row.original.bylines.length > 0 && (
            <span className="text-muted-foreground block text-xs">
              as {row.original.bylines.join(", ")}
            </span>
          )}
          {date && (
            <span className="text-muted-foreground block text-xs tabular-nums">
              {COLUMN_NAMES[date]} {formatDate(row.original[date])}
            </span>
          )}
        </RowOpener>
      );
    },
  },
  count("contributions", "One per person, per role, per article"),
  count("writer"),
  count("image"),
  count("other"),
  {
    id: "sections",
    accessorFn: (row) => row.sections.join(", "),
    header: sortable(COLUMN_NAMES.sections),
    meta: { csvHeader: COLUMN_NAMES.sections },
    cell: ({ row }) => (
      <span className="text-muted-foreground flex flex-wrap gap-x-2">
        {row.original.sections.map((section) => (
          <SectionName key={section} section={section} />
        ))}
      </span>
    ),
  },
  {
    id: "roles",
    accessorFn: (row) =>
      ROLES.filter((role) => row.counts[role] > 0)
        .map((role) => ROLE_NAMES[role])
        .join(", "),
    header: sortable(COLUMN_NAMES.roles),
    meta: { csvHeader: COLUMN_NAMES.roles },
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue() as string}</span>
    ),
  },
  {
    id: "first",
    accessorKey: "first",
    header: sortable(COLUMN_NAMES.first),
    meta: { csvHeader: COLUMN_NAMES.first },
    cell: ({ row }) => (
      <span className="text-muted-foreground whitespace-nowrap">
        {formatDate(row.original.first)}
      </span>
    ),
  },
  {
    id: "last",
    accessorKey: "last",
    header: sortable(COLUMN_NAMES.last),
    meta: { csvHeader: COLUMN_NAMES.last },
    cell: ({ row }) => (
      <span className="text-muted-foreground whitespace-nowrap">
        {formatDate(row.original.last)}
      </span>
    ),
  },
];

/* what a narrower table leaves out until someone asks for it, so none of
   it is cut off at the edge: beside a panel on a smaller laptop, and on a
   phone */
const BESIDE_PANEL = ["other", "sections", "roles", "first", "last"];
const ON_PHONE = ["writer", "image", ...BESIDE_PANEL];

/**
 * what the filters narrow a count to, as words after it: "in News in the last
 * 3 months". Empty when only a role is chosen, which the count's breakdown
 * names, and when nothing is
 */
function scopeOf({ sections, preset, from, to }: FilterState): string {
  const parts: string[] = [];
  if (sections.length > 0)
    parts.push(
      sections.length <= 2
        ? `in ${sortSections(sections).join(" and ")}`
        : `in ${sections.length} sections`,
    );
  const time = PRESETS.find((p) => p.id === preset)!.label.toLowerCase();
  const named = preset === "custom" ? periodNamed(from, to) : null;
  if (preset === "all") {
    /* nothing to say */
  } else if (preset !== "custom")
    parts.push(isRolling(preset) ? `in the ${time}` : time);
  else if (named) parts.push(`in ${named}`);
  else if (from && to)
    parts.push(`from ${formatDate(from)} to ${formatDate(to)}`);
  else if (from) parts.push(`since ${formatDate(from)}`);
  else if (to) parts.push(`until ${formatDate(to)}`);
  return parts.join(" ");
}

const DEFS = Object.fromEntries(
  EVERY_COLUMN.map((column) => [column.id, column]),
) as Record<ColumnId<"people">, ColumnDef<PersonRow, unknown>>;

function People({
  archive,
  filters,
  filterNote,
  filterState,
  heading,
  columns: shown,
  only,
  sorting: held,
  setSorting,
  opened: openRow,
  minimum,
  setMinimum,
  picked,
  setPicked,
  columnsEdited,
  minimumEdited,
}: TableViewProps) {
  const phone = useIsPhone();
  const roomy = useRoomBesidePanel();
  const { open } = openRow;
  const columns = useMemo(
    () =>
      shown
        .filter((id): id is ColumnId<"people"> => id in DEFS)
        .map((id) => DEFS[id]),
    [shown],
  );
  /* a sort on a column this view does not show is held, for the next */
  const sorting = held.filter((by) => shown.includes(by.id as ColumnId));

  /* the search box here looks for a person or a byline they use */
  const all = useMemo(
    () =>
      people(
        applyFilters(archive.articles, { ...filters, search: undefined }),
        filters,
        archive.articles,
      ),
    [archive, filters],
  );
  const rows = useMemo(() => {
    const search = filters.search?.trim() ? searchable(filters.search) : "";
    /* new: first credited anywhere in the range, whatever the filters */
    const today = easternDate(new Date().toISOString());
    const isNew = (row: PersonRow) =>
      row.first >= (filters.from ?? "") && row.first <= (filters.to ?? today);
    return all.filter(
      (row) =>
        (only !== "new" || isNew(row)) &&
        row.contributions >= minimum &&
        (!search ||
          [row.name, ...row.bylines].some((name) =>
            searchable(name).includes(search),
          )),
    );
  }, [all, filters, minimum, only]);

  /* the panel counts what the filters leave, and says so, beside their
     whole record, which someone the filters leave out still opens on */
  const person = open ? peopleOf(archive.articles).get(open) : undefined;
  const inRange = open ? all.find((row) => row.name === open) : undefined;
  const narrowed =
    Boolean(filters.from || filters.to) ||
    filters.sections.length > 0 ||
    filters.roles.length > 0;

  const show = (
    <Choice
      label="Show"
      hideLabel
      width={phone ? "w-full justify-between" : "w-fit"}
      value={String(minimum)}
      edited={minimumEdited}
      options={SHOWS}
      onChange={(n) => setMinimum(Number(n) as Minimum)}
    />
  );

  return (
    <OpenRowProvider value={openRow}>
      {/* a filter like the shell's, so it sits among them */}
      <ToolbarFilters label="Show" icon={UsersRoundIcon}>
        {show}
      </ToolbarFilters>
      <DataTable
        columns={columns}
        data={rows}
        searchable={false}
        empty="Nobody matches these filters."
        csv="people"
        sorting={sorting}
        onSortingChange={setSorting}
        picked={picked}
        onPickedChange={setPicked}
        columnsChanged={
          columnsEdited
            ? { className: EDITED, description: "changed from the saved view" }
            : undefined
        }
        controls={(controls) => <ShellTableControls {...controls} />}
        selected={(row) => row.name === open}
        /* the column a table is sorted by is never one it leaves out; a
           phone writes a date sorted by under the name instead */
        hidden={(phone
          ? ON_PHONE
          : person && !roomy
            ? BESIDE_PANEL
            : []
        ).filter(
          (id) =>
            id !== sorting[0]?.id ||
            (phone && (id === "first" || id === "last")),
        )}
        caption={
          <ViewHeading
            title={heading.title}
            question={heading.question}
            count={[
              `${rows.length} ${only === "new" ? "new " : ""}${rows.length === 1 ? "person" : "people"}`,
              filterNote,
              minimum !== 1 && `${minimum}+ contributions`,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        }
      />

      {person && (
        <RowDetails>
          <PersonPanel
            key={person.name}
            person={person}
            inRange={
              narrowed ? { row: inRange, scope: scopeOf(filterState) } : null
            }
            onClose={openRow.close}
          />
        </RowDetails>
      )}
    </OpenRowProvider>
  );
}

const semesterName = (key: string) =>
  periodOf(periodBounds(key, "semester").from, "semester").label;

function PersonPanel({
  person,
  inRange,
  onClose,
}: {
  person: Person;
  /** under filters: what they leave of this person's (nothing, if they
      leave them out), and in what words */
  inRange: { row: PersonRow | undefined; scope: string } | null;
  onClose: () => void;
}) {
  const trail = useTrail();
  /* the count leads with what the filters leave, and the list is of that,
     unless they leave nothing */
  const contributions = inRange
    ? (inRange.row?.contributions ?? 0)
    : person.contributions.length;
  const roles = inRange ? inRange.row?.counts : person.roles;
  const shown = new Set(inRange?.row?.articleIds);
  const own = person.contributions.filter(
    (c) => shown.size === 0 || shown.has(c.article.id),
  );
  /* one row an article, newest first, with every role of theirs on it */
  const byArticle = new Map<number, Contribution[]>();
  for (const c of own)
    byArticle.set(c.article.id, [...(byArticle.get(c.article.id) ?? []), c]);
  const articles = [...byArticle.values()].reverse();
  const semesters = [...periodsOf(person, "semester")];
  const summary =
    contributions === 0 || !roles
      ? ""
      : ROLES.filter((role) => roles[role] > 0)
          .map((role) => `${roles[role]} ${ROLE_NAMES[role].toLowerCase()}`)
          .join(", ");
  const first = easternDate(person.first.article.publishedAt);
  const latest = easternDate(person.latest.article.publishedAt);

  return (
    <SidePanel title={person.name} back="All people" onClose={onClose}>
      <p className="text-muted-foreground -mt-3 text-xs">
        {contributions === 0 ? "No" : contributions}{" "}
        {contributions === 1 ? "contribution" : "contributions"}
        {inRange?.scope && <> {inRange.scope}</>}
        {summary && <> ({summary})</>}
        <span className="block">
          {inRange && (
            <>
              {counted(
                person.contributions.length,
                "contribution",
                "contributions",
              )}{" "}
              in all ·{" "}
            </>
          )}
          {formatMonth(first)}
          {first.slice(0, 7) !== latest.slice(0, 7) && (
            <> – {formatMonth(latest)}</>
          )}
        </span>
      </p>

      <section className="space-y-1">
        <h3 className="text-muted-foreground text-xs font-medium">
          By semester
        </h3>
        <p className="text-sm">
          {semesters.map(([key, n], index) => (
            <span key={key} className="whitespace-nowrap">
              {index > 0 && <span className="text-muted-foreground"> · </span>}
              {semesterName(key)}{" "}
              <span className="text-muted-foreground tabular-nums">{n}</span>
            </span>
          ))}
        </p>
      </section>

      {person.penNames.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-muted-foreground text-xs font-medium">
            Credited as
          </h3>
          <ul className="text-sm">
            {person.penNames.map((use) => (
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
          {articles.map((theirs) => {
            const { article } = theirs[0]!;
            const as = [...new Set(theirs.flatMap((c) => c.bylines))].join(
              ", ",
            );
            return (
              <li key={article.id} className="space-y-0.5 py-2.5">
                {/* the article's panel, where its credits are set */}
                <a
                  href={articleHref(article.id, trail)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {article.title}
                </a>
                <p className="text-muted-foreground text-xs">
                  {formatDate(article.publishedAt)} ·{" "}
                  <SectionName section={article.section} /> ·{" "}
                  {theirs.map((c) => ROLE_NAMES[c.role]).join(", ")}
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

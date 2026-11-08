import type { ColumnDef } from "@tanstack/react-table";
import {
  PenLineIcon,
  UserRoundIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { DataTable, sortable } from "~/components/data-table";
import {
  FieldActions,
  FieldNote,
  FieldRow,
  FieldRows,
} from "~/components/field-row";
import { SidePanel, useIsPhone } from "~/components/panel";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import type { Archive, ArchiveArticle } from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Role } from "~/lib/credits/labels";
import { same } from "~/lib/credits/sheet";
import {
  applyFilters,
  NO_FILTERS,
  people,
  searchable,
  type PersonRow,
} from "~/lib/credits/stats";
import { ArchiveShell, ToolbarFilters, type ViewProps } from "./archive-shell";
import { BylinePanel } from "./byline-panel";
import { Choice } from "./choice";
import { formatDate, formatMonth } from "./dates";
import { OpenRowProvider, RowDetails, RowOpener, useOpenRow } from "./open-row";
import { PersonPicker } from "./person-picker";
import { useRemovals } from "./removals";
import { SectionName } from "./section-name";
import { ShellTableControls } from "./table-controls";
import { useEdit } from "./use-edit";

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

  const selected = open
    ? (all.find((row) => row.name === open) ??
      everybody.find((row) => row.name === open))
    : undefined;

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
            archive={archive}
            everyone={everybody.map((row) => row.name)}
            onClose={openRow.close}
          />
        </RowDetails>
      )}
    </OpenRowProvider>
  );
}

function PersonPanel({
  person,
  archive,
  everyone,
  onClose,
}: {
  person: PersonRow;
  archive: Archive;
  everyone: string[];
  onClose: () => void;
}) {
  const [byline, setByline] = useState<string | null>(null);
  const [handOver, setHandOver] = useState(false);
  /* the pen name just added, marked in the list for a moment */
  const [added, setAdded] = useState<string | null>(null);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), 4000);
    return () => clearTimeout(timer);
  }, [added]);
  const byId = new Map(archive.articles.map((a) => [a.id, a]));
  const articles = person.articleIds
    .map((id) => byId.get(id))
    .filter((a): a is ArchiveArticle => Boolean(a))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  /* the name as an article prints it, which is what a pen name is */
  const printedOn = archive.articles.filter((a) =>
    a.credits.some((c) =>
      c.contributors.some(
        (p) => p.source === "printed" && p.name === person.name,
      ),
    ),
  ).length;

  const summary = ROLES.filter((role) => person.counts[role] > 0)
    .map((role) => `${person.counts[role]} ${ROLE_NAMES[role].toLowerCase()}`)
    .join(", ");

  if (byline)
    return (
      <BylinePanel
        byline={byline}
        archive={archive}
        everyone={everyone}
        handOverTo={handOver ? person.name : undefined}
        back={person.name}
        onClose={() => {
          setByline(null);
          setHandOver(false);
        }}
      />
    );

  return (
    <SidePanel title={person.name} back="All people" onClose={onClose}>
      <p className="text-muted-foreground -mt-3 text-xs">
        {person.contributions}{" "}
        {person.contributions === 1 ? "contribution" : "contributions"}
        {summary && <> ({summary})</>}
        <span className="block">
          {formatMonth(person.first)}
          {person.first.slice(0, 7) !== person.last.slice(0, 7) && (
            <> – {formatMonth(person.last)}</>
          )}
        </span>
      </p>

      <div className="space-y-3">
        <AddOwnPenName
          person={person}
          archive={archive}
          onAdded={setAdded}
          onHandOver={(pen) => {
            setHandOver(true);
            setByline(pen);
          }}
        />
        <PenNames
          person={person}
          archive={archive}
          added={added}
          onOpen={setByline}
        />
      </div>

      {printedOn > 0 && (
        <>
          <hr />
          <PenNameOf
            byline={person.name}
            articles={printedOn}
            everyone={everyone.filter((name) => name !== person.name)}
            onSaved={onClose}
            onEachArticle={() => setByline(person.name)}
          />
        </>
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
                <a
                  href={article.link}
                  target="_blank"
                  rel="noreferrer"
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

type PenNameUse = {
  byline: string;
  articles: number;
  /* the rows naming them on particular articles */
  rows: { postId: number; role: Role; realNames: string[] }[];
};

/** the pen names that count as this person, each removable in place */
function PenNames({
  person,
  archive,
  added,
  onOpen,
}: {
  person: PersonRow;
  archive: Archive;
  /** a pen name just added, to mark */
  added: string | null;
  onOpen: (byline: string) => void;
}) {
  /* every byline they are credited through: as a pen name on every article,
     or on particular articles only, as when a series changed hands */
  const found = new Map<string, PenNameUse>();
  for (const article of archive.articles) {
    let credited = false;
    for (const credit of article.credits)
      for (const p of credit.contributors) {
        if (p.name !== person.name || !p.byline || p.source === "printed")
          continue;
        const entry = found.get(p.byline.toLowerCase()) ?? {
          byline: p.byline,
          articles: 0,
          rows: [],
        };
        found.set(p.byline.toLowerCase(), entry);
        if (!credited) entry.articles += 1;
        credited = true;
        if (p.source === "article")
          entry.rows.push({
            postId: article.id,
            role: credit.role,
            realNames: credit.contributors
              .filter(
                (q) =>
                  q.source === "article" &&
                  q.byline &&
                  same(q.byline, p.byline!),
              )
              .map((q) => q.name),
          });
      }
  }
  /* and the ones not printed yet, which no article credits them through */
  for (const pen of archive.penNames)
    if (
      pen.realName.includes(person.name) &&
      !found.has(pen.byline.toLowerCase())
    )
      found.set(pen.byline.toLowerCase(), {
        byline: pen.byline,
        articles: 0,
        rows: [],
      });
  const mine = [...found.values()].sort((a, b) => b.articles - a.articles);
  const removals = useRemovals(mine, (use) => use.byline.toLowerCase());
  if (removals.entries.length === 0) return removals.status;

  const remove = (use: PenNameUse) => {
    const { byline, rows } = use;
    const pen = archive.penNames.find((p) => same(p.byline, byline));
    const everywhere = pen?.realName.includes(person.name) ?? false;
    const without = (names: string[]) =>
      names.filter((name) => name !== person.name);
    removals.remove(use, {
      done: `Removed “${byline}”`,
      restored: `Restored “${byline}”`,
      undoLabel: `Undo removing ${byline}`,
      edit: () => ({
        kind: "byline",
        byline,
        everywhere: everywhere ? without(pen!.realName) : undefined,
        articles: rows.map((row) => ({
          ...row,
          realNames: without(row.realNames),
        })),
      }),
      undo: () => ({
        kind: "byline",
        byline,
        everywhere: everywhere ? pen!.realName : undefined,
        articles: rows,
      }),
    });
  };

  return (
    <>
      <ul className="divide-y overflow-hidden rounded-lg border text-sm">
        {removals.entries.map(({ key, item, removed }) => {
          if (removed) return removals.removedRow(key);
          const everywhere = archive.penNames
            .find((p) => same(p.byline, item.byline))
            ?.realName.includes(person.name);
          return (
            <li
              key={key}
              className={cn(
                "flex min-h-11 items-center gap-2 py-1.5 pr-1.5 pl-3 transition-colors duration-700",
                added !== null && same(added, item.byline) && "bg-muted/60",
              )}
            >
              <span className="min-w-0 flex-1">
                <button
                  type="button"
                  className="font-medium underline-offset-4 hover:underline"
                  onClick={() => onOpen(item.byline)}
                >
                  {item.byline}
                </button>
                <span className="text-muted-foreground block text-xs">
                  {item.articles === 0
                    ? "Not printed yet"
                    : everywhere
                      ? `On every article (${item.articles})`
                      : `Only on ${item.articles} ${item.articles === 1 ? "article" : "articles"}`}
                </span>
              </span>
              <Button
                ref={removals.focusBack(key)}
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                aria-label={`Remove ${item.byline}`}
                onClick={() => remove(item)}
              >
                <XIcon />
              </Button>
            </li>
          );
        })}
      </ul>
      {removals.status}
    </>
  );
}

/** starts from the person: one of the bylines they publish under */
function AddOwnPenName({
  person,
  archive,
  onAdded,
  onHandOver,
}: {
  person: PersonRow;
  archive: Archive;
  /** saved: the list below shows it, with its × to take it back */
  onAdded: (byline: string) => void;
  /** the pen name counts as someone else already: hand it over instead */
  onHandOver: (byline: string) => void;
}) {
  const save = useEdit();
  const id = useId();
  const list = useId();
  const [byline, setByline] = useState("");
  const [said, setSaid] = useState("");
  const printed = useMemo(
    () =>
      [
        ...new Set(
          archive.articles.flatMap((a) =>
            a.credits.flatMap((c) =>
              c.contributors
                .filter((p) => p.source === "printed")
                .map((p) => p.name),
            ),
          ),
        ),
      ]
        .filter((name) => name !== person.name)
        .sort(),
    [archive, person.name],
  );

  const typed = byline.trim();
  const count = typed
    ? archive.articles.filter((a) =>
        a.credits.some((c) => c.bylines.some((b) => same(b, typed))),
      ).length
    : null;
  const taken = archive.penNames.find(
    (pen) => same(pen.byline, typed) && !pen.realName.includes(person.name),
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!typed) return;
        if (taken) return onHandOver(taken.byline);
        /* no toast: the new row in the list below is the confirmation, and
           its × takes it back */
        save.mutate(
          {
            edit: {
              kind: "pen-names",
              entries: [{ byline: typed, realName: person.name }],
            },
          },
          {
            onSuccess: () => {
              setByline("");
              setSaid(`${typed} now counts as ${person.name}`);
              onAdded(typed);
            },
          },
        );
      }}
    >
      <FieldRows>
        <FieldRow
          icon={PenLineIcon}
          label="Pen name"
          htmlFor={id}
          width="panel"
        >
          <Input
            id={id}
            list={list}
            value={byline}
            onChange={(event) => setByline(event.target.value)}
            placeholder="As printed"
          />
          <datalist id={list}>
            {printed.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </FieldRow>
        {count !== null && (
          <FieldNote width="panel">
            {taken
              ? `Counts as ${taken.realName.join(" and ")} now. Continue to choose which articles stay theirs.`
              : count === 0
                ? "Not printed yet."
                : `${count} ${count === 1 ? "article" : "articles"} and later ones.`}
          </FieldNote>
        )}
        <FieldActions width="panel">
          <Button
            type="submit"
            variant="outline"
            disabled={!typed || save.isPending}
          >
            {save.isPending ? "Adding…" : taken ? "Continue" : "Add"}
          </Button>
        </FieldActions>
      </FieldRows>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </form>
  );
}

/** says who is really behind a printed name, on every article */
function PenNameOf({
  byline,
  articles,
  everyone,
  onEachArticle,
  onSaved,
}: {
  byline: string;
  articles: number;
  everyone: string[];
  onEachArticle: () => void;
  onSaved: () => void;
}) {
  const save = useEdit();
  const id = useId();
  /* "" is the printed name counting as its own person */
  const [realName, setRealName] = useState("");
  const known = everyone.some((name) => same(name, realName));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!realName) return;
        save.mutate(
          {
            edit: {
              kind: "pen-names",
              entries: [{ byline, realName }],
            },
            done: `${byline} now counts as ${realName}`,
            undo: { kind: "pen-names", entries: [{ byline, realName: "" }] },
          },
          { onSuccess: onSaved },
        );
      }}
    >
      <FieldRows>
        <FieldRow
          icon={UserRoundIcon}
          label="Counts as"
          htmlFor={id}
          width="panel"
        >
          <PersonPicker
            id={id}
            value={realName}
            onChange={setRealName}
            people={everyone}
            none="Themselves"
          />
        </FieldRow>
        <FieldNote width="panel">
          {articles === 1 ? "1 article" : `${articles} articles`} and later
          ones.
          {realName && !known && " Not credited yet."}
          {articles > 1 && (
            <>
              {" "}
              <button
                type="button"
                className="hover:text-foreground text-left underline underline-offset-4"
                onClick={onEachArticle}
              >
                Set per article
              </button>
            </>
          )}
        </FieldNote>
        {realName && (
          <FieldActions width="panel">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRealName("")}
            >
              Cancel
            </Button>
          </FieldActions>
        )}
      </FieldRows>
    </form>
  );
}

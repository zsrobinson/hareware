import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLinkIcon, PlusIcon, UserRoundIcon, XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DataTable, sortable } from "~/components/data-table";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
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
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { Choice } from "./choice";
import { formatDate, formatMonth } from "./dates";
import { useEdit } from "./use-edit";

export function PeoplePage() {
  return (
    <ArchiveShell searchPlaceholder="Search people">
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

function People({ archive, filters }: ViewProps) {
  const [minimum, setMinimum] = useState("1");
  const [open, setOpen] = useState<string | null>(null);

  /* the search box here looks for a person or a byline they use */
  const all = useMemo(
    () =>
      people(
        applyFilters(archive.articles, { ...filters, search: undefined }),
        filters,
      ),
    [archive, filters],
  );
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

  const columns = useMemo<ColumnDef<PersonRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: sortable("Name"),
        cell: ({ row }) => (
          <button
            type="button"
            className="decoration-muted-foreground/40 hover:decoration-foreground text-left underline underline-offset-4"
            onClick={() => setOpen(row.original.name)}
          >
            <span className="font-medium">{row.original.name}</span>
            {row.original.bylines.length > 0 && (
              <span className="text-muted-foreground block text-xs">
                as {row.original.bylines.join(", ")}
              </span>
            )}
          </button>
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
    [],
  );

  /* names to suggest and check against ignore the filters: a person is
     still credited when this semester or section leaves them out */
  const everybody = useMemo(
    () => people(archive.articles, NO_FILTERS),
    [archive],
  );
  const selected = open
    ? (all.find((row) => row.name === open) ??
      everybody.find((row) => row.name === open))
    : undefined;

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchable={false}
        empty="Nobody matches these filters."
        csv="people"
        toolbar={
          <>
            <Choice
              label="Show"
              hideLabel
              width="w-52"
              value={minimum}
              options={["1", "2", "3", "5", "10"].map((n) => ({
                id: n,
                label: n === "1" ? "All people" : `${n}+ contributions`,
              }))}
              onChange={setMinimum}
            />
            <span className="text-muted-foreground text-sm">
              {rows.length} {rows.length === 1 ? "person" : "people"}
            </span>
          </>
        }
      />

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <PersonPanel
              person={selected}
              archive={archive}
              everyone={everybody.map((row) => row.name)}
              onRenamed={() => setOpen(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PersonPanel({
  person,
  archive,
  everyone,
  onRenamed,
}: {
  person: PersonRow;
  archive: Archive;
  everyone: string[];
  onRenamed: () => void;
}) {
  const [form, setForm] = useState<null | "own" | "of">(null);
  const byId = new Map(archive.articles.map((a) => [a.id, a]));
  const articles = person.articleIds
    .map((id) => byId.get(id))
    .filter((a): a is ArchiveArticle => Boolean(a));

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
    .join(" · ");

  return (
    <>
      <SheetHeader>
        <SheetTitle>{person.name}</SheetTitle>
        <SheetDescription>
          {person.contributions}{" "}
          {person.contributions === 1 ? "contribution" : "contributions"}
          {summary && <> ({summary})</>}
          <span className="block whitespace-nowrap">
            {formatMonth(person.first)}
            {person.first.slice(0, 7) !== person.last.slice(0, 7) && (
              <> – {formatMonth(person.last)}</>
            )}
          </span>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-6">
        <PenNames person={person} archive={archive} />
        {form === null ? (
          <div className="-ml-2 flex flex-wrap gap-x-1 gap-y-2">
            <Button variant="ghost" size="xs" onClick={() => setForm("own")}>
              <PlusIcon /> Add a pen name they use
            </Button>
            {printedOn > 0 && (
              <Button variant="ghost" size="xs" onClick={() => setForm("of")}>
                <UserRoundIcon /> This is someone else's pen name
              </Button>
            )}
          </div>
        ) : form === "own" ? (
          <AddOwnPenName
            person={person}
            archive={archive}
            onClose={() => setForm(null)}
          />
        ) : (
          <PenNameOf
            byline={person.name}
            articles={printedOn}
            everyone={everyone.filter((name) => name !== person.name)}
            onSaved={onRenamed}
            onClose={() => setForm(null)}
          />
        )}

        <section className="space-y-1">
          <h3 className="text-muted-foreground text-xs font-medium">
            Articles
          </h3>
          <ul className="divide-y text-sm">
            {articles.map((article) => {
              const roles = article.credits
                .filter((c) =>
                  c.contributors.some((p) => p.name === person.name),
                )
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
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {article.title}
                    <ExternalLinkIcon className="text-muted-foreground ml-1 inline size-3 align-baseline" />
                  </a>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(article.publishedAt)} · {article.section} ·{" "}
                    {[...new Set(roles)].join(", ")}
                    {as && <> · as {as}</>}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

/** the pen names that count as this person on every article */
function PenNames({
  person,
  archive,
}: {
  person: PersonRow;
  archive: Archive;
}) {
  const save = useEdit();
  const mine = archive.penNames.filter((p) => p.realName.includes(person.name));
  if (mine.length === 0) return null;

  return (
    <section className="space-y-1">
      <h3 className="text-muted-foreground text-xs font-medium">Pen names</h3>
      <ul className="text-sm">
        {mine.map((pen) => (
          <li
            key={pen.byline}
            className="group flex items-center justify-between gap-2 py-1"
          >
            <span>
              {pen.byline}{" "}
              <span className="text-muted-foreground">
                · {pen.articles} {pen.articles === 1 ? "article" : "articles"}
              </span>
            </span>
            <Button
              className="text-muted-foreground"
              variant="ghost"
              size="xs"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  edit: {
                    kind: "pen-names",
                    /* keep anyone else who shares the pen name */
                    entries: (() => {
                      const others = pen.realName.filter(
                        (n) => n !== person.name,
                      );
                      return others.length > 0
                        ? others.map((realName) => ({
                            byline: pen.byline,
                            realName,
                          }))
                        : [{ byline: pen.byline, realName: "" }];
                    })(),
                  },
                  done: `${pen.byline} no longer counts as ${person.name}`,
                  undo: {
                    kind: "pen-names",
                    entries: pen.realName.map((realName) => ({
                      byline: pen.byline,
                      realName,
                    })),
                  },
                })
              }
            >
              <XIcon /> Remove
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** starts from the person: one of the bylines they publish under */
function AddOwnPenName({
  person,
  archive,
  onClose,
}: {
  person: PersonRow;
  archive: Archive;
  onClose: () => void;
}) {
  const save = useEdit();
  const list = useId();
  const [byline, setByline] = useState("");
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

  const count = byline.trim()
    ? archive.articles.filter((a) =>
        a.credits.some((c) => c.bylines.some((b) => same(b, byline))),
      ).length
    : null;
  return (
    <form
      className="bg-muted/40 w-full space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!byline.trim()) return;
        save.mutate(
          {
            edit: {
              kind: "pen-names",
              entries: [{ byline: byline.trim(), realName: person.name }],
            },
            done: `${byline.trim()} now counts as ${person.name}`,
            undo: {
              kind: "pen-names",
              entries: archive.penNames
                .find((pen) => same(pen.byline, byline.trim()))
                ?.realName.map((realName) => ({
                  byline: byline.trim(),
                  realName,
                })) ?? [{ byline: byline.trim(), realName: "" }],
            },
          },
          {
            onSuccess: onClose,
          },
        );
      }}
    >
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">
          A byline {person.name} publishes under
        </span>
        <Input
          autoFocus
          list={list}
          value={byline}
          onChange={(event) => setByline(event.target.value)}
          placeholder="Pen name"
          className="bg-background"
        />
        <datalist id={list}>
          {printed.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      {count !== null && (
        <p className="text-muted-foreground text-xs">
          {count === 0
            ? "Not printed yet."
            : `${count} ${count === 1 ? "article" : "articles"}, and any later ones.`}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={!byline.trim() || save.isPending}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** says who is really behind a printed name, on every article */
function PenNameOf({
  byline,
  articles,
  everyone,
  onSaved,
  onClose,
}: {
  byline: string;
  articles: number;
  everyone: string[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const save = useEdit();
  const list = useId();
  const [realName, setRealName] = useState("");

  const known = everyone.find((name) => same(name, realName));
  return (
    <form
      className="bg-muted/40 w-full space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!realName.trim()) return;
        save.mutate(
          {
            edit: {
              kind: "pen-names",
              entries: [{ byline, realName: known ?? realName.trim() }],
            },
            done: `${byline} now counts as ${known ?? realName.trim()}`,
            undo: { kind: "pen-names", entries: [{ byline, realName: "" }] },
          },
          { onSuccess: onSaved },
        );
      }}
    >
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Who is behind {byline}?</span>
        <Input
          autoFocus
          list={list}
          value={realName}
          onChange={(event) => setRealName(event.target.value)}
          placeholder="Real name"
          className="bg-background"
        />
        <datalist id={list}>
          {everyone.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <p className="text-muted-foreground text-xs">
        {articles === 1 ? "1 article" : `${articles} articles`}, and any later
        ones.
        {realName.trim() && !known && " Not credited yet."}
      </p>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={!realName.trim() || save.isPending}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

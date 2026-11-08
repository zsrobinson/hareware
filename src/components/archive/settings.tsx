import {
  ClipboardPasteIcon,
  ExternalLinkIcon,
  IdCardIcon,
  PenLineIcon,
  PencilIcon,
  TagIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  FieldActions,
  FieldNote,
  FieldRow,
  FieldRows,
} from "~/components/field-row";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import type { Archive, ArticleOverride, PenName } from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Label, type Role } from "~/lib/credits/labels";
import { same } from "~/lib/credits/sheet";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { BylinePanel, usesOf } from "./byline-panel";
import { Choice } from "./choice";
import { PersonPicker } from "./person-picker";
import { useRemovals } from "./removals";
import { useEdit } from "./use-edit";

export function SettingsPage() {
  return (
    <ArchiveShell filters={false} reload="sheet">
      {(props) => <Settings {...props} />}
    </ArchiveShell>
  );
}

function Settings({ archive, reloadButton }: ViewProps) {
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
  /* how many articles print a byline, for the counts beside a pen name */
  const printedCount = (byline: string) =>
    archive.articles.filter((a) =>
      a.credits.some((c) => c.bylines.some((b) => same(b, byline))),
    ).length;

  return (
    <div className="max-w-2xl space-y-10">
      <PenNames
        archive={archive}
        everyone={everyone}
        printedCount={printedCount}
        reloadButton={reloadButton}
      />
      <ArticleRows archive={archive} />
      <Labels archive={archive} />
      <SheetStatus archive={archive} />
    </div>
  );
}

function Section({
  id,
  title,
  action,
  children,
}: {
  id?: string;
  title: string;
  /** at the end of the heading's row */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* the bordered list each section keeps its rows in */
const LIST = "divide-y rounded-lg border text-sm";
const ROW = "flex min-h-11 items-center gap-x-3 py-1.5 pr-1.5 pl-3";
/* a row's name and what it means: side by side, or stacked on a phone */
const NAMED =
  "flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3";

/** the row's own buttons: Edit where there is one, and Remove */
function RowButtons({
  name,
  onEdit,
  onRemove,
  removeRef,
}: {
  name: string;
  onEdit?: () => void;
  onRemove: () => void;
  removeRef: (element: HTMLElement | null) => void;
}) {
  return (
    <span className="text-muted-foreground ml-auto flex">
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${name}`}
          onClick={onEdit}
        >
          <PencilIcon />
        </Button>
      )}
      <Button
        ref={removeRef}
        variant="ghost"
        size="icon"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </span>
  );
}

/* ---- pen names ------------------------------------------------------------ */

function PenNames({
  archive,
  everyone,
  printedCount,
  reloadButton,
}: {
  archive: Archive;
  everyone: string[];
  printedCount: (byline: string) => number;
  reloadButton: React.ReactNode;
}) {
  const list = useId();
  const [open, setOpen] = useState<string | null>(null);
  const [handOverTo, setHandOverTo] = useState<string | undefined>();
  const [pasting, setPasting] = useState(false);
  /* where focus goes once a pasted list is saved and its box has gone */
  const pasteButton = useRef<HTMLButtonElement>(null);
  const removals = useRemovals(archive.penNames, (pen) =>
    pen.byline.toLowerCase(),
  );

  const remove = (pen: PenName) =>
    removals.remove(pen, {
      done: `Removed “${pen.byline}”`,
      restored: `Restored “${pen.byline}”`,
      undoLabel: `Undo removing ${pen.byline}`,
      edit: () => ({
        kind: "pen-names",
        entries: [{ byline: pen.byline, realName: "" }],
      }),
      undo: () => ({
        kind: "pen-names",
        entries: pen.realName.map((realName) => ({
          byline: pen.byline,
          realName,
        })),
      }),
    });

  return (
    <Section title="Pen names" action={reloadButton}>
      <datalist id={list}>
        {everyone.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <AddPenName
        list={list}
        everyone={everyone}
        printedCount={printedCount}
        penNames={archive.penNames}
        pasting={pasting}
        pasteRef={pasteButton}
        onPaste={() => setPasting((on) => !on)}
        onHandOver={(byline, to) => {
          setHandOverTo(to);
          setOpen(byline);
        }}
      />
      {pasting && (
        <PasteSeveral
          everyone={everyone}
          printedCount={printedCount}
          penNames={archive.penNames}
          onSaved={() => {
            setPasting(false);
            pasteButton.current?.focus();
          }}
        />
      )}

      {removals.entries.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border px-4 py-6 text-center text-sm">
          No pen names yet.
        </p>
      ) : (
        <ul className={LIST}>
          {removals.entries.map(({ key, item: pen, removed }) =>
            removed ? (
              removals.removedRow(key)
            ) : (
              <PenNameRow
                key={key}
                pen={pen}
                archive={archive}
                removeRef={removals.focusBack(key)}
                onOpen={() => {
                  setHandOverTo(undefined);
                  setOpen(pen.byline);
                }}
                onRemove={() => remove(pen)}
              />
            ),
          )}
        </ul>
      )}
      {removals.status}

      {open !== null && (
        <BylinePanel
          byline={open}
          archive={archive}
          everyone={everyone}
          handOverTo={handOverTo}
          back="Settings"
          onClose={() => setOpen(null)}
        />
      )}
    </Section>
  );
}

function PenNameRow({
  pen,
  archive,
  onOpen,
  onRemove,
  removeRef,
}: {
  pen: PenName;
  archive: Archive;
  onOpen: () => void;
  onRemove: () => void;
  removeRef: (element: HTMLElement | null) => void;
}) {
  /* articles where the byline is someone else, as when a series changed hands */
  const elsewhere = new Map<string, number>();
  for (const use of usesOf(archive, pen.byline))
    for (const name of use.own)
      if (!pen.realName.includes(name))
        elsewhere.set(name, (elsewhere.get(name) ?? 0) + 1);

  return (
    <li className={ROW}>
      <span className={NAMED}>
        <span className="shrink-0 font-medium sm:w-40">{pen.byline}</span>
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground">counts as </span>
          {pen.realName.join(" and ")}
          {[...elsewhere].map(([name, count]) => (
            <span key={name} className="text-muted-foreground block text-xs">
              {count} {count === 1 ? "article counts" : "articles count"} as{" "}
              {name} instead
            </span>
          ))}
        </span>
      </span>
      <span className="text-muted-foreground tabular-nums max-sm:hidden">
        {pen.articles === 0
          ? "Not printed yet"
          : `${pen.articles} ${pen.articles === 1 ? "article" : "articles"}`}
      </span>
      <RowButtons
        name={pen.byline}
        onEdit={onOpen}
        onRemove={onRemove}
        removeRef={removeRef}
      />
    </li>
  );
}

function AddPenName({
  list,
  everyone,
  printedCount,
  penNames,
  pasting,
  pasteRef,
  onPaste,
  onHandOver,
}: {
  list: string;
  everyone: string[];
  printedCount: (byline: string) => number;
  penNames: PenName[];
  pasting: boolean;
  pasteRef: React.Ref<HTMLButtonElement>;
  onPaste: () => void;
  /** the pen name counts as someone else already: hand it over instead */
  onHandOver: (byline: string, to: string) => void;
}) {
  const save = useEdit();
  const ids = { byline: useId(), realName: useId() };
  /* Add disables as the fields clear, which would leave focus on the page */
  const first = useRef<HTMLInputElement>(null);
  const [byline, setByline] = useState("");
  const [realName, setRealName] = useState("");
  const count = byline.trim() ? printedCount(byline) : null;
  const taken = penNames.find(
    (pen) =>
      same(pen.byline, byline.trim()) &&
      !pen.realName.some((name) => same(name, realName.trim())),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!byline.trim() || !realName.trim()) return;
        if (taken) {
          onHandOver(taken.byline, realName.trim());
          setByline("");
          setRealName("");
          return;
        }
        save.mutate(
          {
            edit: {
              kind: "pen-names",
              entries: [{ byline: byline.trim(), realName: realName.trim() }],
            },
            done: `${byline.trim()} now counts as ${realName.trim()}`,
            undo: {
              kind: "pen-names",
              entries: penNames
                .find((pen) => same(pen.byline, byline.trim()))
                ?.realName.map((name) => ({
                  byline: byline.trim(),
                  realName: name,
                })) ?? [{ byline: byline.trim(), realName: "" }],
            },
          },
          {
            onSuccess: () => {
              setByline("");
              setRealName("");
              first.current?.focus();
            },
          },
        );
      }}
    >
      <FieldRows>
        <FieldRow icon={PenLineIcon} label="Pen name" htmlFor={ids.byline}>
          <Input
            ref={first}
            id={ids.byline}
            list={list}
            placeholder="As printed"
            value={byline}
            onChange={(event) => setByline(event.target.value)}
          />
        </FieldRow>
        <FieldRow
          icon={UserRoundIcon}
          label="Counts as"
          htmlFor={ids.realName}
          inline
        >
          <PersonPicker
            id={ids.realName}
            value={realName}
            onChange={setRealName}
            people={everyone}
          />
        </FieldRow>
        {count !== null && (
          <FieldNote>
            {taken
              ? `Counts as ${taken.realName.join(" and ")} now. Continue to choose which articles stay theirs.`
              : count === 0
                ? "Not printed yet."
                : `${count} ${count === 1 ? "article" : "articles"}.`}
          </FieldNote>
        )}
        <FieldActions>
          <Button
            type="submit"
            variant="outline"
            disabled={!byline.trim() || !realName.trim() || save.isPending}
          >
            {save.isPending ? "Adding…" : taken ? "Continue" : "Add"}
          </Button>
          <Button
            ref={pasteRef}
            type="button"
            variant="ghost"
            aria-expanded={pasting}
            onClick={onPaste}
          >
            Paste a list
          </Button>
        </FieldActions>
      </FieldRows>
    </form>
  );
}

/** "Pen name = Real name", one per line, checked before anything is saved */
function PasteSeveral({
  everyone,
  printedCount,
  penNames,
  onSaved,
}: {
  everyone: string[];
  printedCount: (byline: string) => number;
  penNames: PenName[];
  onSaved: () => void;
}) {
  const save = useEdit();
  const id = useId();
  const [text, setText] = useState("");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = lines.map((line) => {
    const [byline = "", realName = ""] = line
      .split(/\s*(?:=|→|->|\t)\s*/)
      .map((part) => part.trim());
    return { line, byline, realName };
  });
  /* a header row copied from a spreadsheet is not a pen name */
  const header = (p: (typeof parsed)[number]) =>
    /^(pen ?name|byline)s?$/i.test(p.byline);
  const valid = parsed.filter((p) => p.byline && p.realName && !header(p));

  return (
    <FieldRows>
      <FieldRow icon={ClipboardPasteIcon} label="List" htmlFor={id} top>
        <div className="space-y-3">
          <Textarea
            id={id}
            autoFocus
            rows={5}
            placeholder="Pen name = Real name, one per line"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="font-mono text-sm placeholder:font-sans"
          />
          {parsed.length > 0 && (
            <ul className={LIST}>
              {parsed.map((p, index) => {
                const count = p.byline ? printedCount(p.byline) : 0;
                const known = everyone.some((n) => same(n, p.realName));
                const was = penNames.find((pen) => same(pen.byline, p.byline));
                const replaces =
                  was && !was.realName.some((n) => same(n, p.realName))
                    ? was.realName.join(" and ")
                    : null;
                return (
                  <li
                    key={index}
                    className="flex flex-wrap items-baseline gap-x-2 px-3 py-1.5"
                  >
                    {header(p) ? (
                      <span className="text-muted-foreground">
                        Skipped the header row
                      </span>
                    ) : p.byline && p.realName ? (
                      <>
                        <span className="font-medium">{p.byline}</span>
                        <span className="text-muted-foreground">counts as</span>
                        <span>{p.realName}</span>
                        <span className="text-muted-foreground ml-auto">
                          {count === 0
                            ? "Not printed yet"
                            : `${count} ${count === 1 ? "article" : "articles"}`}
                          {!known && " · not credited yet"}
                          {replaces && ` · replaces ${replaces}`}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Skipped “{p.line}”: use “Pen name = Real name”.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </FieldRow>
      <FieldActions>
        <Button
          variant="outline"
          disabled={valid.length === 0 || save.isPending}
          onClick={() =>
            save.mutate(
              {
                edit: {
                  kind: "pen-names",
                  entries: valid.map(({ byline, realName }) => ({
                    byline,
                    realName,
                  })),
                },
                done: `Added ${valid.length} pen ${valid.length === 1 ? "name" : "names"}`,
                /* what those bylines counted as before, or nobody */
                undo: {
                  kind: "pen-names",
                  entries: [
                    ...new Set(valid.map((v) => v.byline.toLowerCase())),
                  ].flatMap((key) => {
                    const byline = valid.find(
                      (v) => v.byline.toLowerCase() === key,
                    )!.byline;
                    const before = penNames.find((p) => same(p.byline, byline));
                    return before
                      ? before.realName.map((realName) => ({
                          byline,
                          realName,
                        }))
                      : [{ byline, realName: "" }];
                  }),
                },
              },
              {
                onSuccess: () => {
                  setText("");
                  onSaved();
                },
              },
            )
          }
        >
          {save.isPending ? "Adding…" : "Add pen names"}
        </Button>
      </FieldActions>
    </FieldRows>
  );
}

/* ---- rows for one article ------------------------------------------------- */

const overrideKey = (o: ArticleOverride) =>
  [o.postId, o.role, o.byline?.toLowerCase(), o.realName.toLowerCase()].join(
    "|",
  );

/** rows that hold for one article, set from that article's panel */
function ArticleRows({ archive }: { archive: Archive }) {
  const removals = useRemovals(archive.articleOverrides, overrideKey);

  const remove = (o: ArticleOverride) => {
    const where = `“${o.title ?? `article ${o.postId}`}”`;
    /* the rows for one article and role, which is what a save replaces */
    const here = (rows: ArticleOverride[]) =>
      rows.filter((x) => x.postId === o.postId && x.role === o.role);

    if (o.byline) {
      /* a byline's rows on one article and role, any role included */
      const mine = (rows: ArticleOverride[]) =>
        here(rows).filter((x) => x.byline && same(x.byline, o.byline!));
      const at = (rows: ArticleOverride[]) => [
        {
          postId: o.postId!,
          role: o.role,
          realNames: rows.map((x) => x.realName),
        },
      ];
      removals.remove(o, {
        done: `Removed “${o.byline}” on ${where}`,
        restored: `Restored “${o.byline}” on ${where}`,
        undoLabel: `Undo removing ${o.byline} on ${where}`,
        edit: (rest) => ({
          kind: "byline",
          byline: o.byline!,
          articles: at(mine(rest)),
        }),
        undo: (rest) => ({
          kind: "byline",
          byline: o.byline!,
          articles: at([...mine(rest), o]),
        }),
      });
    } else {
      const entries = (rows: ArticleOverride[]) =>
        rows.map((x) => ({ byline: x.byline, realName: x.realName }));
      removals.remove(o, {
        done: `Removed “${o.realName}” from ${where}`,
        restored: `Restored “${o.realName}” on ${where}`,
        undoLabel: `Undo removing ${o.realName} from ${where}`,
        edit: (rest) => ({
          kind: "article-credits",
          postId: o.postId!,
          role: o.role!,
          entries: entries(here(rest)),
        }),
        undo: (rest) => ({
          kind: "article-credits",
          postId: o.postId!,
          role: o.role!,
          entries: entries([...here(rest), o]),
        }),
      });
    }
  };

  return (
    <Section title="Articles counted differently">
      {removals.entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          None yet. Set one from{" "}
          <a
            href="/articles"
            className="hover:text-foreground underline underline-offset-4"
          >
            Articles
          </a>
          .
        </p>
      ) : (
        <ul className={LIST}>
          {removals.entries.map(({ key, item: o, removed }) =>
            removed ? (
              removals.removedRow(key)
            ) : (
              <li key={key} className={ROW}>
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground">
                    {o.title ?? `article ${o.postId}`} ·{" "}
                    {o.role ? ROLE_NAMES[o.role] : "any role"} ·{" "}
                  </span>
                  {o.byline ? (
                    <>
                      {o.byline}
                      <span className="text-muted-foreground"> counts as </span>
                      {o.realName}
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">adds </span>
                      {o.realName}
                    </>
                  )}
                </span>
                {(o.byline || o.role) && (
                  <RowButtons
                    name={o.byline ?? o.realName}
                    onRemove={() => remove(o)}
                    removeRef={removals.focusBack(key)}
                  />
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {removals.status}
    </Section>
  );
}

/* ---- labels ------------------------------------------------------------- */

function Labels({ archive }: { archive: Archive }) {
  const save = useEdit();
  const removals = useRemovals(archive.labels, (label) =>
    label.label.toLowerCase(),
  );
  const used = (label: string) =>
    archive.articles.filter((a) => a.credits.some((c) => same(c.label, label)))
      .length;
  /* the whole list is saved each time, as the Sheet's tab holds it */
  const saveAll = (
    labels: Label[],
    done: string,
    {
      onSuccess,
      undoable,
    }: { onSuccess?: () => void; undoable?: boolean } = {},
  ) =>
    save.mutate(
      {
        edit: { kind: "labels", labels },
        done,
        undo: undoable ? { kind: "labels", labels: archive.labels } : undefined,
      },
      { onSuccess },
    );

  const remove = (label: Label) => {
    const index = archive.labels.indexOf(label);
    const uses = used(label.label);
    removals.remove(label, {
      done:
        uses > 0
          ? `Removed “${label.label}:”; ${uses} ${uses === 1 ? "article stops" : "articles stop"} counting it`
          : `Removed “${label.label}:”`,
      restored: `Restored “${label.label}:”`,
      undoLabel: `Undo removing ${label.label}:`,
      edit: (rest) => ({ kind: "labels", labels: rest }),
      undo: (rest) => ({
        kind: "labels",
        labels: [...rest.slice(0, index), label, ...rest.slice(index)],
      }),
    });
  };

  return (
    <Section id="labels" title="Credit labels">
      <AddLabel
        busy={save.isPending}
        onAdd={(label, done) =>
          saveAll([...archive.labels, label], `Added “${label.label}:”`, {
            onSuccess: done,
          })
        }
      />
      <ul className={LIST}>
        {removals.entries.map(({ key, item: label, removed }) =>
          removed ? (
            removals.removedRow(key)
          ) : (
            <LabelRow
              key={key}
              label={label}
              uses={used(label.label)}
              busy={save.isPending}
              removeRef={removals.focusBack(key)}
              onSave={(next) =>
                saveAll(
                  archive.labels.map((l) => (l === label ? next : l)),
                  `Saved “${next.label}:”`,
                  { undoable: true },
                )
              }
              onRemove={() => remove(label)}
            />
          ),
        )}
      </ul>
      {removals.status}
    </Section>
  );
}

function LabelRow({
  label,
  uses,
  busy,
  onSave,
  onRemove,
  removeRef,
}: {
  label: Label;
  uses: number;
  busy: boolean;
  onSave: (label: Label) => void;
  onRemove: () => void;
  removeRef: (element: HTMLElement | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  if (editing)
    return (
      <li>
        <form
          className="flex flex-wrap items-center gap-2 px-3 py-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.label.trim()) return;
            onSave({ ...draft, label: draft.label.trim() });
            setEditing(false);
          }}
        >
          <Input
            autoFocus
            className="w-56"
            aria-label="Label"
            value={draft.label}
            onChange={(event) =>
              setDraft({ ...draft, label: event.target.value })
            }
          />
          <Choice
            label="Role"
            hideLabel
            width="w-32"
            value={draft.role}
            options={ROLES.map((role) => ({
              id: role,
              label: ROLE_NAMES[role],
            }))}
            onChange={(role) => setDraft({ ...draft, role })}
          />
          <span className="flex-1" />
          <Button type="submit" disabled={busy || !draft.label.trim()}>
            Save
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setDraft(label);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      </li>
    );

  return (
    <li className={ROW}>
      <span className={NAMED}>
        <span className="shrink-0 font-medium sm:w-40">{label.label}:</span>
        <span className="text-muted-foreground min-w-0 flex-1">
          {ROLE_NAMES[label.role]} ·{" "}
          {uses === 0
            ? "unused"
            : `${uses} ${uses === 1 ? "article" : "articles"}`}
        </span>
      </span>
      <RowButtons
        name={`${label.label}:`}
        onEdit={() => setEditing(true)}
        onRemove={onRemove}
        removeRef={removeRef}
      />
    </li>
  );
}

/* a guess at the role a new label credits, for one offered from Problems */
const roleFor = (label: string): Role =>
  /image|photo|picture|illustrat|graphic|art\b|draw|cartoon|thumbnail|video/i.test(
    label,
  )
    ? "image"
    : "writer";

function AddLabel({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (label: Label, done: () => void) => void;
}) {
  const id = useId();
  /* Problems links here with the unknown line's label to add */
  const [offered] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("label"),
  );
  const [label, setLabel] = useState(offered ? `${offered}:` : "");
  const [role, setRole] = useState<Role>(offered ? roleFor(offered) : "image");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!offered) return;
    input.current?.scrollIntoView({ block: "center" });
    input.current?.focus({ preventScroll: true });
  }, [offered]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!label.trim()) return;
        /* Add disables as the field clears, which would leave focus on
           the page */
        onAdd({ label: label.trim().replace(/:$/, ""), role }, () => {
          setLabel("");
          input.current?.focus();
        });
      }}
    >
      <FieldRows>
        <FieldRow icon={TagIcon} label="Label" htmlFor={id}>
          <Input
            ref={input}
            id={id}
            placeholder="Photos by:"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </FieldRow>
        <FieldRow icon={IdCardIcon} label="Role" inline>
          <Choice
            label="Role"
            hideLabel
            width="w-full"
            value={role}
            options={ROLES.map((r) => ({ id: r, label: ROLE_NAMES[r] }))}
            onChange={setRole}
          />
        </FieldRow>
        <FieldActions>
          <Button
            type="submit"
            variant="outline"
            disabled={!label.trim() || busy}
          >
            Add
          </Button>
          {offered && (
            <a
              href="/problems"
              className="text-muted-foreground hover:text-foreground ml-auto text-sm underline-offset-4 hover:underline"
            >
              Back to Problems
            </a>
          )}
        </FieldActions>
      </FieldRows>
    </form>
  );
}

/* ---- the Sheet ------------------------------------------------------------ */

function SheetStatus({ archive }: { archive: Archive }) {
  const { sheet } = archive;
  const status =
    sheet.status === "unconfigured"
      ? "Not connected yet."
      : sheet.status === "failed"
        ? `Couldn't be read: ${sheet.reason}`
        : sheet.missingTabs.length > 0
          ? `Connected. HareWare adds the ${sheet.missingTabs.join(", ")} ${sheet.missingTabs.length === 1 ? "tab" : "tabs"} the first time it saves there.`
          : "Connected.";

  return (
    <Section title="The Sheet">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={sheet.status === "failed" ? "text-destructive" : undefined}
          title={
            sheet.status === "unconfigured"
              ? `${sheet.missing.join(" and ")} unset`
              : undefined
          }
        >
          {status}
        </span>
        {sheet.status === "read" && sheet.url && (
          <a
            href={sheet.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            Open in Google Sheets <ExternalLinkIcon className="size-3.5" />
          </a>
        )}
      </div>
      {archive.sheetProblems.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Rows HareWare couldn't use</p>
          <ul className="text-muted-foreground space-y-0.5">
            {archive.sheetProblems.map((problem, index) => (
              <li key={index}>
                {problem.tab}
                {problem.row > 0 && `, row ${problem.row}`}: {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

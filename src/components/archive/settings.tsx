import {
  ClipboardPasteIcon,
  ExternalLinkIcon,
  IdCardIcon,
  PencilIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FieldActions, FieldRow, FieldRows } from "~/components/field-row";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  bylineKey,
  type Archive,
  type ArticleOverride,
  type UnscopedPenName,
} from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Label, type Role } from "~/lib/credits/labels";
import { same, type BylineOn } from "~/lib/credits/sheet";
import { ArchiveShell, useTrail, type ViewProps } from "./archive-shell";
import { Choice } from "./choice";
import { articleHref } from "./open-row";
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
  return (
    <div className="max-w-2xl space-y-10">
      <PenNames archive={archive} reloadButton={reloadButton} />
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

const overrideKey = (o: ArticleOverride) =>
  [
    o.postId,
    o.role,
    o.byline ? bylineKey(o.byline) : "",
    bylineKey(o.realName),
  ].join("|");

/**
 * Every row the Sheet holds, each for one article: who a byline is there, or
 * someone the article does not print. They are set from an article's panel;
 * here they can be read in one place, removed, or pasted in many at once.
 */
export function PenNames({
  archive,
  reloadButton,
}: {
  archive: Archive;
  reloadButton: React.ReactNode;
}) {
  const trail = useTrail();
  const [pasting, setPasting] = useState(false);
  /* where focus goes once a pasted list is saved and its box has gone */
  const pasteButton = useRef<HTMLButtonElement>(null);
  /* newest articles first: the rows someone is most likely looking for */
  const rows = useMemo(
    () => [...archive.overrides].sort((a, b) => b.postId - a.postId),
    [archive],
  );
  const removals = useRemovals(rows, overrideKey);

  const remove = (o: ArticleOverride) => {
    const where = `“${o.title ?? `article ${o.postId}`}”`;
    /* the rows for one article and role, which is what a save replaces */
    const here = (rows: ArticleOverride[]) =>
      rows.filter((x) => x.postId === o.postId && x.role === o.role);

    if (o.byline) {
      /* a byline's rows on one article and role, any role included */
      const mine = (rows: ArticleOverride[]) =>
        here(rows).filter((x) => x.byline && same(x.byline, o.byline!));
      const entry = (rows: ArticleOverride[]) => ({
        kind: "bylines" as const,
        entries: [
          {
            postId: o.postId,
            role: o.role,
            byline: o.byline!,
            realNames: rows.map((x) => x.realName),
          },
        ],
      });
      removals.remove(o, {
        done: `Removed “${o.byline}” on ${where}`,
        restored: `Restored “${o.byline}” on ${where}`,
        undoLabel: `Undo removing ${o.byline} on ${where}`,
        edit: (rest) => entry(mine(rest)),
        undo: (rest) => entry([...mine(rest), o]),
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
          postId: o.postId,
          role: o.role!,
          entries: entries(here(rest)),
        }),
        undo: (rest) => ({
          kind: "article-credits",
          postId: o.postId,
          role: o.role!,
          entries: entries([...here(rest), o]),
        }),
      });
    }
  };

  return (
    <Section title="Pen names" action={reloadButton}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground flex-1 text-sm">
          Set from an article's panel in{" "}
          <a
            href="/articles"
            className="hover:text-foreground underline underline-offset-4"
          >
            Articles
          </a>
          .
        </p>
        <Button
          ref={pasteButton}
          type="button"
          variant="ghost"
          aria-expanded={pasting}
          onClick={() => setPasting((on) => !on)}
        >
          <ClipboardPasteIcon /> Paste rows
        </Button>
      </div>
      {pasting && (
        <PasteRows
          archive={archive}
          onSaved={() => {
            setPasting(false);
            pasteButton.current?.focus();
          }}
        />
      )}

      {removals.entries.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border px-4 py-6 text-center text-sm">
          None yet.
        </p>
      ) : (
        <ul className={LIST}>
          {removals.entries.map(({ key, item: o, removed }) =>
            removed ? (
              removals.removedRow(key)
            ) : (
              <li key={key} className={ROW}>
                <span className="min-w-0 flex-1">
                  {o.byline ? (
                    <>
                      <span className="font-medium">{o.byline}</span>
                      <span className="text-muted-foreground"> counts as </span>
                      {o.realName}
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">Adds </span>
                      {o.realName}
                    </>
                  )}
                  <a
                    href={articleHref(o.postId, trail)}
                    className="text-muted-foreground hover:text-foreground block truncate text-xs underline-offset-4 hover:underline"
                  >
                    {o.title ?? `Article ${o.postId}`} ·{" "}
                    {o.role ? ROLE_NAMES[o.role] : "any role"}
                  </a>
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

      <Unscoped archive={archive} />
    </Section>
  );
}

/* a line pasted from the Sheet's own columns: post id, role, byline, real
   name, note. `roles` is the role given, or every role the article prints
   the byline in when it is blank */
type Row = {
  line: number;
  postId: number;
  roles: Role[];
  byline: string;
  realName: string;
  note: string;
  title: string;
};
type Pasted = Row | { line: number; text: string; skip: string };

/* the Sheet's role words, and the ones the pages show */
const ROLE_WORDS = new Map<string, Role>([
  ...ROLES.map((r) => [r, r] as const),
  ...ROLES.map((r) => [ROLE_NAMES[r].toLowerCase(), r] as const),
]);

function parsePasted(text: string, archive: Archive): Pasted[] {
  const byId = new Map(archive.articles.map((a) => [a.id, a]));
  return text
    .split("\n")
    .map((text, i) => ({ text: text.trim(), line: i + 1 }))
    .filter(({ text }) => text)
    .map(({ text, line }): Pasted => {
      /* a spreadsheet copies as tabs; commas only when there are none, so a
         name with a comma in it survives */
      const [id = "", rawRole = "", byline = "", realName = "", note = ""] = (
        text.includes("\t") ? text.split("\t") : text.split(",")
      ).map((cell) => cell.trim());
      const skip = (why: string) => ({ line, text, skip: why });
      if (/^post_?id$/i.test(id)) return skip("the header row");
      const article = byId.get(Number(id));
      if (!article) return skip(`no published article is ${id || "blank"}`);
      const role = rawRole ? ROLE_WORDS.get(rawRole.toLowerCase()) : null;
      if (role === undefined) return skip(`“${rawRole}” is not a role`);
      if (!byline || !realName)
        return skip("it needs a byline and a real name");
      const roles = ROLES.filter(
        (r) =>
          (role === null || r === role) &&
          article.credits.some(
            (c) => c.role === r && c.bylines.some((b) => same(b, byline)),
          ),
      );
      if (roles.length === 0)
        return skip(`“${article.title}” does not print “${byline}”`);
      return {
        line,
        postId: article.id,
        roles,
        byline,
        realName,
        note,
        title: article.title,
      };
    });
}

/**
 * The edit pasted rows make, and the one that undoes it: one entry per
 * byline, article and role, naming everyone pasted for it. A row the article
 * already has for any role is split into explicit roles first, so it does not
 * stand beside the pasted ones.
 */
function pastedEdits(rows: Row[], archive: Archive) {
  const entries = new Map<string, BylineOn>();
  const keyOf = (postId: number, role: Role | null, byline: string) =>
    [postId, role ?? "", bylineKey(byline)].join("|");
  const put = (entry: BylineOn) =>
    entries.set(keyOf(entry.postId, entry.role, entry.byline), entry);

  for (const row of rows) {
    const anyRole = archive.overrides.filter(
      (o) =>
        o.postId === row.postId &&
        o.role === null &&
        o.byline &&
        same(o.byline, row.byline),
    );
    if (
      anyRole.length > 0 &&
      !entries.has(keyOf(row.postId, null, row.byline))
    ) {
      put({
        postId: row.postId,
        role: null,
        byline: row.byline,
        realNames: [],
      });
      const article = archive.articles.find((a) => a.id === row.postId)!;
      for (const c of article.credits)
        if (
          c.bylines.some((b) => same(b, row.byline)) &&
          !entries.has(keyOf(row.postId, c.role, row.byline))
        )
          put({
            postId: row.postId,
            role: c.role,
            byline: row.byline,
            /* with whoever that role already names on its own */
            realNames: [
              ...archive.overrides
                .filter(
                  (o) =>
                    o.postId === row.postId &&
                    o.role === c.role &&
                    o.byline &&
                    same(o.byline, row.byline),
                )
                .map((o) => o.realName),
              ...anyRole.map((o) => o.realName),
            ].filter((n, i, all) => all.findIndex((m) => same(m, n)) === i),
          });
    }
  }
  /* pasted names replace whatever that byline was in that role */
  const pasted = new Set<string>();
  for (const row of rows)
    for (const role of row.roles) {
      const key = keyOf(row.postId, role, row.byline);
      const entry: BylineOn = pasted.has(key)
        ? entries.get(key)!
        : { postId: row.postId, role, byline: row.byline, realNames: [] };
      pasted.add(key);
      if (!entry.realNames.some((n) => same(n, row.realName)))
        entry.realNames.push(row.realName);
      if (row.note) entry.note = row.note;
      put(entry);
    }

  const edit = [...entries.values()];
  const undo = edit.map((e) => {
    const before = archive.overrides.filter(
      (o) =>
        o.postId === e.postId &&
        o.role === e.role &&
        o.byline &&
        same(o.byline, e.byline),
    );
    /* the rows' own note comes back with them, when they shared one */
    const notes = [...new Set(before.map((o) => o.note))];
    return {
      ...e,
      realNames: before.map((o) => o.realName),
      note: notes.length === 1 ? notes[0] : undefined,
    };
  });
  return { edit, undo, rows: pasted.size };
}

/** rows copied from a spreadsheet, checked against the articles before saving */
function PasteRows({
  archive,
  onSaved,
}: {
  archive: Archive;
  onSaved: () => void;
}) {
  const save = useEdit();
  const id = useId();
  const [text, setText] = useState("");
  const parsed = parsePasted(text, archive);
  const valid = parsed.filter((p): p is Row => !("skip" in p));
  const skipped = parsed.filter(
    (p) => "skip" in p && p.skip !== "the header row",
  );
  const { edit, undo, rows } = pastedEdits(valid, archive);

  return (
    <FieldRows>
      <FieldRow icon={ClipboardPasteIcon} label="Rows" htmlFor={id} top>
        <div className="space-y-3">
          <Textarea
            id={id}
            autoFocus
            rows={5}
            placeholder="Post id, role, byline, real name, note: one row per line"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="font-mono text-sm placeholder:font-sans"
          />
          {parsed.length > 0 && (
            <>
              <p className="text-muted-foreground text-sm tabular-nums">
                {valid.length} to save
                {skipped.length > 0 && ` · ${skipped.length} skipped`}
              </p>
              <ul className={LIST}>
                {parsed.map((p) => (
                  <li
                    key={p.line}
                    className="flex flex-wrap items-baseline gap-x-2 px-3 py-1.5"
                  >
                    {"skip" in p ? (
                      <span className="text-muted-foreground">
                        Line {p.line} skipped: {p.skip}
                      </span>
                    ) : (
                      <>
                        <span className="font-medium">{p.byline}</span>
                        <span className="text-muted-foreground">counts as</span>
                        <span>{p.realName}</span>
                        <span className="text-muted-foreground ml-auto truncate">
                          {p.title} ·{" "}
                          {p.roles.map((r) => ROLE_NAMES[r]).join(", ")}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </FieldRow>
      <FieldActions>
        <Button
          variant="outline"
          disabled={edit.length === 0 || save.isPending}
          onClick={() =>
            save.mutate(
              {
                edit: { kind: "bylines", entries: edit },
                done: `Saved ${rows} ${rows === 1 ? "row" : "rows"}${skipped.length > 0 ? ` · ${skipped.length} skipped` : ""}`,
                undo: { kind: "bylines", entries: undo },
              },
              {
                /* what was skipped stays, to fix and paste again */
                onSuccess: () => {
                  if (skipped.length > 0)
                    setText(
                      skipped
                        .map((p) => ("text" in p ? p.text : ""))
                        .join("\n"),
                    );
                  else {
                    setText("");
                    onSaved();
                  }
                },
              },
            )
          }
        >
          {save.isPending ? "Saving…" : "Save rows"}
        </Button>
      </FieldActions>
    </FieldRows>
  );
}

/**
 * Rows with a byline and no post id, which count nowhere (ADR 0013). Each can
 * be set on the articles that print the byline and have no row for it, after
 * seeing which, or removed; both can be undone.
 */
function Unscoped({ archive }: { archive: Archive }) {
  const save = useEdit();
  const [showing, setShowing] = useState<string | null>(null);
  if (archive.unscoped.length === 0) return null;
  const keyOf = (u: UnscopedPenName) => bylineKey(u.byline);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        These rows name no article, so they count nowhere.
      </p>
      <ul className={LIST}>
        {archive.unscoped.map((u) => {
          const key = keyOf(u);
          const count = u.targets.length;
          const restore = {
            kind: "bylines" as const,
            entries: [],
            restore: u.rows,
          };
          return (
            <li key={key} className="space-y-2 py-1.5 pr-1.5 pl-3">
              <div className="flex min-h-8 items-center gap-x-3">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{u.byline}</span>
                  <span className="text-muted-foreground"> counted as </span>
                  {u.realNames.join(" and ")}
                  {u.role && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {ROLE_NAMES[u.role]}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground ml-auto flex">
                  {count > 0 && (
                    <Button
                      variant="ghost"
                      aria-expanded={showing === key}
                      onClick={() => setShowing(showing === key ? null : key)}
                    >
                      Set on {count} {count === 1 ? "article" : "articles"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${u.byline}`}
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate({
                        edit: {
                          kind: "bylines",
                          entries: [],
                          retire: u.rows,
                        },
                        done: `Removed “${u.byline}”`,
                        undo: restore,
                      })
                    }
                  >
                    <XIcon />
                  </Button>
                </span>
              </div>
              {showing === key && (
                <div className="space-y-2 pb-1">
                  <ul className="text-muted-foreground text-sm">
                    {u.targets.map((t) => (
                      <li key={t.postId} className="truncate">
                        {t.title} ·{" "}
                        {t.roles.map((r) => ROLE_NAMES[r]).join(", ")}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={save.isPending}
                      onClick={() => {
                        /* each role takes the names of the rows meant for it */
                        const entries = u.targets.flatMap((t) =>
                          t.roles.map((role) => ({
                            postId: t.postId,
                            role,
                            byline: u.byline,
                            realNames: u.rows
                              .filter((r) => r.role === null || r.role === role)
                              .map((r) => r.realName),
                          })),
                        );
                        save.mutate(
                          {
                            edit: {
                              kind: "bylines",
                              entries,
                              retire: u.rows,
                            },
                            done: `Set “${u.byline}” on ${count} ${count === 1 ? "article" : "articles"}`,
                            undo: {
                              kind: "bylines",
                              entries: entries.map((e) => ({
                                ...e,
                                realNames: [],
                              })),
                              restore: u.rows,
                            },
                          },
                          { onSuccess: () => setShowing(null) },
                        );
                      }}
                    >
                      Set on these
                    </Button>
                    <Button variant="ghost" onClick={() => setShowing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
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

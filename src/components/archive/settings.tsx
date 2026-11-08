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
import type { Archive, ArticleOverride } from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Label, type Role } from "~/lib/credits/labels";
import { same, type BylineOn } from "~/lib/credits/sheet";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { Choice } from "./choice";
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
  [o.postId, o.role, o.byline?.toLowerCase(), o.realName.toLowerCase()].join(
    "|",
  );

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
                    href={`/articles?article=${o.postId}`}
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

/* a line pasted from the Sheet's own columns: post id, role, byline, name */
type Row = {
  line: string;
  postId: number;
  role: Role | null;
  byline: string;
  realName: string;
  title: string;
};
type Pasted = Row | { line: string; skip: string };

function parsePasted(text: string, archive: Archive): Pasted[] {
  const titles = new Map(archive.articles.map((a) => [a.id, a]));
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): Pasted => {
      const [id = "", rawRole = "", byline = "", realName = ""] = line
        .split(/\t|\s*,\s*/)
        .map((cell) => cell.trim());
      if (/^post_?id$/i.test(id)) return { line, skip: "the header row" };
      const postId = Number(id);
      const article = titles.get(postId);
      const role = rawRole.toLowerCase();
      if (!article) return { line, skip: `no published article is ${id}` };
      if (role && !ROLES.includes(role as Role))
        return { line, skip: `“${rawRole}” is not a role` };
      if (!byline || !realName)
        return { line, skip: "it needs a byline and a real name" };
      const prints = article.credits.some(
        (c) =>
          (!role || c.role === role) && c.bylines.some((b) => same(b, byline)),
      );
      if (!prints)
        return { line, skip: `“${article.title}” does not print “${byline}”` };
      return {
        line,
        postId,
        role: (role || null) as Role | null,
        byline,
        realName,
        title: article.title,
      };
    });
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

  /* one entry per byline on an article and role, with every name it is */
  const grouped = new Map<string, BylineOn>();
  for (const p of valid) {
    const key = [p.postId, p.role ?? "", p.byline.toLowerCase()].join("|");
    const entry = grouped.get(key) ?? {
      postId: p.postId,
      role: p.role,
      byline: p.byline,
      realNames: [],
    };
    if (!entry.realNames.some((n) => same(n, p.realName)))
      entry.realNames.push(p.realName);
    grouped.set(key, entry);
  }
  const entries = [...grouped.values()];
  /* what those bylines were on those articles before, or nobody */
  const before = entries.map((e) => ({
    ...e,
    realNames: archive.overrides
      .filter(
        (o) =>
          o.postId === e.postId &&
          o.role === e.role &&
          o.byline &&
          same(o.byline, e.byline),
      )
      .map((o) => o.realName),
  }));

  return (
    <FieldRows>
      <FieldRow icon={ClipboardPasteIcon} label="Rows" htmlFor={id} top>
        <div className="space-y-3">
          <Textarea
            id={id}
            autoFocus
            rows={5}
            placeholder="post_id, role, byline, real_name — one per line"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="font-mono text-sm placeholder:font-sans"
          />
          {parsed.length > 0 && (
            <ul className={LIST}>
              {parsed.map((p, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-baseline gap-x-2 px-3 py-1.5"
                >
                  {"skip" in p ? (
                    <span className="text-muted-foreground">
                      Skipped: {p.skip}
                    </span>
                  ) : (
                    <>
                      <span className="font-medium">{p.byline}</span>
                      <span className="text-muted-foreground">counts as</span>
                      <span>{p.realName}</span>
                      <span className="text-muted-foreground ml-auto truncate">
                        {p.title}
                        {p.role && ` · ${ROLE_NAMES[p.role]}`}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </FieldRow>
      <FieldActions>
        <Button
          variant="outline"
          disabled={entries.length === 0 || save.isPending}
          onClick={() =>
            save.mutate(
              {
                edit: { kind: "bylines", entries },
                done: `Saved ${valid.length} ${valid.length === 1 ? "row" : "rows"}`,
                undo: { kind: "bylines", entries: before },
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
          {save.isPending ? "Saving…" : "Save rows"}
        </Button>
      </FieldActions>
    </FieldRows>
  );
}

/**
 * Rows from when a pen name could hold on every article. They count nowhere
 * now; each can be set on the articles that print it, or removed.
 */
function Unscoped({ archive }: { archive: Archive }) {
  const save = useEdit();
  if (archive.unscoped.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        These rows name no article, so they no longer count.
      </p>
      <ul className={LIST}>
        {archive.unscoped.map((u) => (
          <li key={u.byline} className={ROW}>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{u.byline}</span>
              <span className="text-muted-foreground"> counted as </span>
              {u.realNames.join(" and ")}
            </span>
            <span className="text-muted-foreground ml-auto flex">
              {u.articleIds.length > 0 && (
                <Button
                  variant="ghost"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      edit: {
                        kind: "bylines",
                        entries: u.articleIds.map((postId) => ({
                          postId,
                          role: null,
                          byline: u.byline,
                          realNames: u.realNames,
                        })),
                        retire: [u.byline],
                      },
                      done: `Set “${u.byline}” on ${u.articleIds.length} ${u.articleIds.length === 1 ? "article" : "articles"}`,
                    })
                  }
                >
                  Set on {u.articleIds.length}{" "}
                  {u.articleIds.length === 1 ? "article" : "articles"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${u.byline}`}
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    edit: { kind: "bylines", entries: [], retire: [u.byline] },
                    done: `Removed “${u.byline}”`,
                  })
                }
              >
                <XIcon />
              </Button>
            </span>
          </li>
        ))}
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

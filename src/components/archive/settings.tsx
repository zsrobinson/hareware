import { ChevronRightIcon, ExternalLinkIcon, PlusIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { Sheet, SheetContent } from "~/components/ui/sheet";
import { Textarea } from "~/components/ui/textarea";
import type { Archive, PenName } from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Label, type Role } from "~/lib/credits/labels";
import { same } from "~/lib/credits/sheet";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { Choice } from "./choice";
import { BylinePanel, usesOf } from "./byline-panel";
import { useEdit } from "./use-edit";

export function SettingsPage() {
  return (
    <ArchiveShell filters={false}>
      {(props) => <Settings {...props} />}
    </ArchiveShell>
  );
}

function Settings({ archive }: ViewProps) {
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
    <div className="max-w-3xl space-y-12">
      <PenNames
        archive={archive}
        everyone={everyone}
        printedCount={printedCount}
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
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/* ---- pen names ------------------------------------------------------------ */

function PenNames({
  archive,
  everyone,
  printedCount,
}: {
  archive: Archive;
  everyone: string[];
  printedCount: (byline: string) => number;
}) {
  const list = useId();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Section
      title="Pen names"
      description="Bylines that stand for someone else."
    >
      <datalist id={list}>
        {everyone.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="rounded-xl border">
        <AddPenName
          list={list}
          printedCount={printedCount}
          penNames={archive.penNames}
        />
        {archive.penNames.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            No pen names yet.
          </p>
        ) : (
          <ul className="divide-y">
            {archive.penNames.map((pen) => (
              <PenNameRow
                key={pen.byline}
                pen={pen}
                archive={archive}
                onOpen={() => setOpen(pen.byline)}
              />
            ))}
          </ul>
        )}
      </div>

      <PasteSeveral
        everyone={everyone}
        printedCount={printedCount}
        penNames={archive.penNames}
      />
      <Sheet
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open !== null && (
            <BylinePanel
              byline={open}
              archive={archive}
              everyone={everyone}
              onDone={() => setOpen(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </Section>
  );
}

function PenNameRow({
  pen,
  archive,
  onOpen,
}: {
  pen: PenName;
  archive: Archive;
  onOpen: () => void;
}) {
  const save = useEdit();
  /* articles where the byline is someone else, as when a series changed hands */
  const elsewhere = new Map<string, number>();
  for (const use of usesOf(archive, pen.byline))
    for (const name of use.own)
      if (!pen.realName.includes(name))
        elsewhere.set(name, (elsewhere.get(name) ?? 0) + 1);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
      <span className="w-44 shrink-0 font-medium">{pen.byline}</span>
      <>
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground">counts as </span>
          {pen.realName.join(" and ")}
          {[...elsewhere].map(([name, count]) => (
            <span key={name} className="text-muted-foreground block text-xs">
              {name} on {count} {count === 1 ? "article" : "articles"}
            </span>
          ))}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {pen.articles} {pen.articles === 1 ? "article" : "articles"}
        </span>
        <span className="text-muted-foreground flex gap-1">
          <Button variant="ghost" size="xs" onClick={onOpen}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                edit: {
                  kind: "pen-names",
                  entries: [{ byline: pen.byline, realName: "" }],
                },
                done: `${pen.byline} no longer counts as ${pen.realName.join(" and ")}`,
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
            Remove
          </Button>
        </span>
      </>
    </li>
  );
}

function AddPenName({
  list,
  printedCount,
  penNames,
}: {
  list: string;
  printedCount: (byline: string) => number;
  penNames: PenName[];
}) {
  const save = useEdit();
  const [byline, setByline] = useState("");
  const [realName, setRealName] = useState("");
  const count = byline.trim() ? printedCount(byline) : null;

  return (
    <form
      className="bg-muted/30 flex flex-wrap items-center gap-2 border-b px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!byline.trim() || !realName.trim()) return;
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
            },
          },
        );
      }}
    >
      <Input
        list={list}
        className="bg-background h-8 w-44"
        placeholder="Pen name"
        value={byline}
        onChange={(event) => setByline(event.target.value)}
      />
      <span className="text-muted-foreground text-sm">counts as</span>
      <Input
        list={list}
        className="bg-background h-8 min-w-40 flex-1"
        placeholder="Real name"
        value={realName}
        onChange={(event) => setRealName(event.target.value)}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={!byline.trim() || !realName.trim() || save.isPending}
      >
        <PlusIcon /> Add
      </Button>
      {count !== null && (
        <span className="text-muted-foreground w-full text-xs">
          {count === 0
            ? "Not printed yet."
            : `${count} ${count === 1 ? "article" : "articles"}.`}
        </span>
      )}
    </form>
  );
}

/** "Pen name = Real name", one per line, checked before anything is saved */
function PasteSeveral({
  everyone,
  printedCount,
  penNames,
}: {
  everyone: string[];
  printedCount: (byline: string) => number;
  penNames: PenName[];
}) {
  const save = useEdit();
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
    <Collapsible>
      <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm">
        <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
        Add several at once
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 space-y-3">
          <Textarea
            rows={5}
            placeholder={
              "One per line: Pen name = Real name\nPasting two columns from a spreadsheet works too."
            }
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="font-mono text-sm"
          />
          {parsed.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
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
          <Button
            size="sm"
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
                  done: `Saved ${valid.length} pen ${valid.length === 1 ? "name" : "names"}`,
                  /* what those bylines counted as before, or nobody */
                  undo: {
                    kind: "pen-names",
                    entries: [
                      ...new Set(valid.map((v) => v.byline.toLowerCase())),
                    ].flatMap((key) => {
                      const byline = valid.find(
                        (v) => v.byline.toLowerCase() === key,
                      )!.byline;
                      const before = penNames.find((p) =>
                        same(p.byline, byline),
                      );
                      return before
                        ? before.realName.map((realName) => ({
                            byline,
                            realName,
                          }))
                        : [{ byline, realName: "" }];
                    }),
                  },
                },
                { onSuccess: () => setText("") },
              )
            }
          >
            {save.isPending
              ? "Saving…"
              : `Save ${valid.length || ""} pen ${valid.length === 1 ? "name" : "names"}`}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** rows that hold for one article, set from that article's edit panel */
function ArticleRows({ archive }: { archive: Archive }) {
  const save = useEdit();

  /* the rows for one article and role, which is what a save replaces */
  const others = (
    postId: number,
    role: Role | null,
    keep: (typeof archive.articleOverrides)[number] | undefined,
  ) =>
    archive.articleOverrides
      .filter((o) => o.postId === postId && o.role === role && o !== keep)
      .map((o) => ({ byline: o.byline, realName: o.realName }));

  return (
    <Section
      title="Counted differently on one article"
      description="Set from an article's panel in Articles."
    >
      {archive.articleOverrides.length === 0 ? (
        <p className="text-muted-foreground text-sm">None yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border text-sm">
          {archive.articleOverrides.map((o, index) => (
            <li
              key={index}
              className="group flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5"
            >
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
                <Button
                  className="text-muted-foreground"
                  variant="ghost"
                  size="xs"
                  disabled={save.isPending}
                  onClick={() => {
                    const where = `“${o.title ?? `article ${o.postId}`}”`;
                    if (o.byline) {
                      /* a byline's rows on one article and role, any role included */
                      const mine = archive.articleOverrides.filter(
                        (x) =>
                          x.postId === o.postId &&
                          x.role === o.role &&
                          x.byline?.toLowerCase() === o.byline!.toLowerCase(),
                      );
                      const at = (rows: typeof mine) => [
                        {
                          postId: o.postId!,
                          role: o.role,
                          realNames: rows.map((x) => x.realName),
                        },
                      ];
                      save.mutate({
                        edit: {
                          kind: "byline",
                          byline: o.byline,
                          articles: at(mine.filter((x) => x !== o)),
                        },
                        done: `${o.byline} counts as printed again on ${where}`,
                        undo: {
                          kind: "byline",
                          byline: o.byline,
                          articles: at(mine),
                        },
                      });
                    } else
                      save.mutate({
                        edit: {
                          kind: "article-credits",
                          postId: o.postId!,
                          role: o.role!,
                          entries: others(o.postId!, o.role, o),
                        },
                        done: `${o.realName} is no longer added to ${where}`,
                        undo: {
                          kind: "article-credits",
                          postId: o.postId!,
                          role: o.role!,
                          entries: others(o.postId!, o.role, undefined),
                        },
                      });
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ---- labels ------------------------------------------------------------- */

function Labels({ archive }: { archive: Archive }) {
  const save = useEdit();
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

  return (
    <Section
      id="labels"
      title="Credit labels"
      description="How a credit line starts."
    >
      <div className="rounded-xl border">
        <AddLabel
          busy={save.isPending}
          onAdd={(label, done) =>
            saveAll([...archive.labels, label], `Added “${label.label}”`, {
              onSuccess: done,
            })
          }
        />
        <ul className="divide-y">
          {archive.labels.map((label, index) => (
            <LabelRow
              key={`${label.label}-${index}`}
              label={label}
              uses={used(label.label)}
              busy={save.isPending}
              onSave={(next) =>
                saveAll(
                  archive.labels.map((l, i) => (i === index ? next : l)),
                  `Saved “${next.label}”`,
                )
              }
              onRemove={() => {
                const uses = used(label.label);
                saveAll(
                  archive.labels.filter((_, i) => i !== index),
                  uses > 0
                    ? `Removed “${label.label}”; ${uses} ${uses === 1 ? "article stops" : "articles stop"} counting it`
                    : `Removed “${label.label}”`,
                  { undoable: true },
                );
              }}
            />
          ))}
        </ul>
      </div>
    </Section>
  );
}

function LabelRow({
  label,
  uses,
  busy,
  onSave,
  onRemove,
}: {
  label: Label;
  uses: number;
  busy: boolean;
  onSave: (label: Label) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  if (editing)
    return (
      <li>
        <form
          className="flex flex-wrap items-center gap-2 px-4 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.label.trim()) return;
            onSave({ ...draft, label: draft.label.trim() });
            setEditing(false);
          }}
        >
          <Input
            autoFocus
            className="h-8 w-56"
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
          <Button
            size="xs"
            type="submit"
            disabled={busy || !draft.label.trim()}
          >
            Save
          </Button>
          <Button
            size="xs"
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
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
      <span className="w-44 font-medium">{label.label}:</span>
      <span className="text-muted-foreground flex-1">
        {ROLE_NAMES[label.role]}
      </span>
      <span className="text-muted-foreground tabular-nums">
        {uses === 0
          ? "Unused"
          : `${uses} ${uses === 1 ? "article" : "articles"}`}
      </span>
      <span className="text-muted-foreground flex gap-1">
        <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button variant="ghost" size="xs" disabled={busy} onClick={onRemove}>
          Remove
        </Button>
      </span>
    </li>
  );
}

function AddLabel({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (label: Label, done: () => void) => void;
}) {
  /* Problems links here with the unknown line's label to add */
  const [label, setLabel] = useState(() => {
    if (typeof window === "undefined") return "";
    const offered = new URLSearchParams(window.location.search).get("label");
    return offered ? `${offered}:` : "";
  });
  const [role, setRole] = useState<Role>("image");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (label) input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on arrival only
  }, []);

  return (
    <form
      className="bg-muted/30 flex flex-wrap items-center gap-2 border-b px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!label.trim()) return;
        onAdd({ label: label.trim().replace(/:$/, ""), role }, () =>
          setLabel(""),
        );
      }}
    >
      <Input
        ref={input}
        className="bg-background h-8 w-56"
        placeholder="New label, like Photos by:"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <Choice
        label="Role"
        hideLabel
        width="w-32"
        value={role}
        options={ROLES.map((r) => ({ id: r, label: ROLE_NAMES[r] }))}
        onChange={setRole}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={!label.trim() || busy}
      >
        <PlusIcon /> Add
      </Button>
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

import {
  ChevronRightIcon,
  ExternalLinkIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import type { Archive, PenName } from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Label, type Role } from "~/lib/credits/labels";
import { same } from "~/lib/credits/sheet";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { Choice } from "./choice";
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
    <div className="space-y-12">
      <PenNames
        archive={archive}
        everyone={everyone}
        printedCount={printedCount}
      />
      <Labels archive={archive} />
      <SheetStatus archive={archive} />
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
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

  return (
    <Section
      title="Pen names"
      description="A byline that stands for someone else counts as them, on every article that prints it."
    >
      <datalist id={list}>
        {everyone.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="rounded-xl border">
        {archive.penNames.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            No pen names yet.
          </p>
        ) : (
          <ul className="divide-y">
            {archive.penNames.map((pen) => (
              <PenNameRow key={pen.byline} pen={pen} list={list} />
            ))}
          </ul>
        )}
        <AddPenName list={list} printedCount={printedCount} />
      </div>

      <PasteSeveral everyone={everyone} printedCount={printedCount} />
      <ArticleRows archive={archive} />
    </Section>
  );
}

function PenNameRow({ pen, list }: { pen: PenName; list: string }) {
  const save = useEdit();
  const [editing, setEditing] = useState(false);
  const [names, setNames] = useState(pen.realName.join(", "));

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
      <span className="w-44 shrink-0 font-medium">{pen.byline}</span>
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const realNames = names
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean);
            save.mutate(
              {
                edit: {
                  kind: "pen-names",
                  entries:
                    realNames.length > 0
                      ? realNames.map((realName) => ({
                          byline: pen.byline,
                          realName,
                        }))
                      : [{ byline: pen.byline, realName: "" }],
                },
                done: `Saved ${pen.byline}`,
              },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <Input
            autoFocus
            list={list}
            className="h-8 flex-1"
            value={names}
            onChange={(event) => setNames(event.target.value)}
            aria-label={`Who writes as ${pen.byline}`}
          />
          <Button size="xs" type="submit" disabled={save.isPending}>
            Save
          </Button>
          <Button
            size="xs"
            variant="ghost"
            type="button"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            <span className="text-muted-foreground">counts as </span>
            {pen.realName.join(" and ")}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {pen.articles} {pen.articles === 1 ? "article" : "articles"}
          </span>
          <span className="flex gap-1">
            <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={save.isPending}
              aria-label={`Remove ${pen.byline}`}
              onClick={() =>
                save.mutate({
                  edit: {
                    kind: "pen-names",
                    entries: [{ byline: pen.byline, realName: "" }],
                  },
                  done: `${pen.byline} counts as printed again`,
                })
              }
            >
              <XIcon />
            </Button>
          </span>
        </>
      )}
    </li>
  );
}

function AddPenName({
  list,
  printedCount,
}: {
  list: string;
  printedCount: (byline: string) => number;
}) {
  const save = useEdit();
  const [byline, setByline] = useState("");
  const [realName, setRealName] = useState("");
  const count = byline.trim() ? printedCount(byline) : null;

  return (
    <form
      className="bg-muted/30 flex flex-wrap items-center gap-2 border-t px-4 py-3"
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
            ? "No article prints this byline yet."
            : `Printed on ${count} ${count === 1 ? "article" : "articles"}.`}
        </span>
      )}
    </form>
  );
}

/** "Pen name = Real name", one per line, checked before anything is saved */
function PasteSeveral({
  everyone,
  printedCount,
}: {
  everyone: string[];
  printedCount: (byline: string) => number;
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
  const valid = parsed.filter((p) => p.byline && p.realName);

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
            placeholder={"One per line:\nPen Name = Real Name"}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="font-mono text-sm"
          />
          {parsed.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {parsed.map((p, index) => {
                const count = p.byline ? printedCount(p.byline) : 0;
                const known = everyone.some((n) => same(n, p.realName));
                return (
                  <li
                    key={index}
                    className="flex flex-wrap items-baseline gap-x-3 px-3 py-1.5"
                  >
                    {p.byline && p.realName ? (
                      <>
                        <span className="font-medium">{p.byline}</span>
                        <span className="text-muted-foreground">→</span>
                        <span>{p.realName}</span>
                        <span className="text-muted-foreground ml-auto text-xs">
                          {count === 0
                            ? "not printed anywhere"
                            : `${count} ${count === 1 ? "article" : "articles"}`}
                          {!known && " · new name"}
                        </span>
                      </>
                    ) : (
                      <span className="text-destructive">
                        Can't read “{p.line}”. Use “Pen name = Real name”.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Button
            size="sm"
            disabled={
              valid.length === 0 ||
              valid.length !== parsed.length ||
              save.isPending
            }
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
  if (archive.articleOverrides.length === 0) return null;

  /* the rows for one article and role, which is what a save replaces */
  const others = (
    postId: number,
    role: Role | null,
    keep: (typeof archive.articleOverrides)[number],
  ) =>
    archive.articleOverrides
      .filter((o) => o.postId === postId && o.role === role && o !== keep)
      .map((o) => ({ byline: o.byline, realName: o.realName }));

  return (
    <Collapsible>
      <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm">
        <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
        {archive.articleOverrides.length} single-article{" "}
        {archive.articleOverrides.length === 1 ? "change" : "changes"}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-3 divide-y rounded-xl border text-sm">
          {archive.articleOverrides.map((o, index) => (
            <li
              key={index}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground">
                  {o.title ?? `post ${o.postId}`} ·{" "}
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
              {o.role && (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={save.isPending}
                  aria-label="Remove"
                  onClick={() =>
                    save.mutate({
                      edit: {
                        kind: "article-credits",
                        postId: o.postId!,
                        role: o.role!,
                        entries: others(o.postId!, o.role, o),
                      },
                      done: "Removed",
                    })
                  }
                >
                  <XIcon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ---- labels --------------------------------------------------------------- */

function Labels({ archive }: { archive: Archive }) {
  const save = useEdit();
  const [labels, setLabels] = useState<Label[]>(archive.labels);
  const changed = JSON.stringify(labels) !== JSON.stringify(archive.labels);
  const used = (label: string) =>
    archive.articles.filter((a) => a.credits.some((c) => same(c.label, label)))
      .length;

  return (
    <Section
      title="Credit labels"
      description="A short paragraph starting with one of these and a colon is a credit line."
    >
      <ul className="divide-y rounded-xl border">
        {labels.map((label, index) => (
          <li key={index} className="flex items-center gap-3 px-4 py-2">
            <Input
              className="h-8 w-56"
              value={label.label}
              aria-label="Label"
              onChange={(event) =>
                setLabels(
                  labels.map((l, i) =>
                    i === index ? { ...l, label: event.target.value } : l,
                  ),
                )
              }
            />
            <Choice
              label="Role"
              hideLabel
              width="w-32"
              value={label.role}
              options={ROLES.map((role) => ({
                id: role,
                label: ROLE_NAMES[role],
              }))}
              onChange={(role) =>
                setLabels(
                  labels.map((l, i) => (i === index ? { ...l, role } : l)),
                )
              }
            />
            <span className="text-muted-foreground flex-1 text-right text-sm tabular-nums">
              {used(label.label) || "unused"}
            </span>
            <Button
              variant="ghost"
              size="xs"
              aria-label={`Remove ${label.label}`}
              onClick={() => setLabels(labels.filter((_, i) => i !== index))}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLabels([...labels, { label: "", role: "writer" }])}
        >
          <PlusIcon /> Add label
        </Button>
        <span className="flex-1" />
        {changed && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLabels(archive.labels)}
            >
              Undo
            </Button>
            <Button
              size="sm"
              disabled={save.isPending || labels.some((l) => !l.label.trim())}
              onClick={() =>
                save.mutate({
                  edit: { kind: "labels", labels },
                  done: "Saved credit labels",
                })
              }
            >
              {save.isPending ? "Saving…" : "Save labels"}
            </Button>
          </>
        )}
      </div>
    </Section>
  );
}

/* ---- the Sheet ------------------------------------------------------------ */

function SheetStatus({ archive }: { archive: Archive }) {
  const { sheet } = archive;
  const status =
    sheet.status === "unconfigured"
      ? `Not connected: ${sheet.missing.join(" and ")} unset.`
      : sheet.status === "failed"
        ? `Couldn't be read: ${sheet.reason}`
        : sheet.missingTabs.length > 0
          ? `Connected. HareWare adds the ${sheet.missingTabs.join(", ")} ${sheet.missingTabs.length === 1 ? "tab" : "tabs"} the first time it saves there.`
          : "Connected.";

  return (
    <Section
      title="The Sheet"
      description="Where HareWare keeps what WordPress doesn't. It's private to the board."
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={sheet.status === "read" ? undefined : "text-destructive"}
        >
          {status}
        </span>
        {sheet.status === "read" && sheet.url && (
          <a
            href={sheet.url}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Open in Google Sheets <ExternalLinkIcon />
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

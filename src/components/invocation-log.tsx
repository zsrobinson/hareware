import type { ColumnDef, Table } from "@tanstack/react-table";
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  HandIcon,
  LinkIcon,
  MinusIcon,
  MousePointerClickIcon,
  SlashIcon,
  TerminalIcon,
  TriangleAlertIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "cn";
import { DataTable } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useNow } from "~/components/now";
import { setParams, useParam } from "~/components/url-state";
import type { Directory } from "~/lib/actors";
import { ago, enrich, needsAttention, type Enriched } from "~/lib/log-view";
import type { Row } from "~/lib/log";

/** the row as it crosses to the client: json has no Date and needs none */
export type LogRow = Row;

/*
  four outcomes, four readings. binary would put `skipped` in the same red as
  `failed`, so a Tuesday with no board meeting — the quiet morning ADR 0007
  exists to distinguish — would read as broken. `misconfigured` is amber
  because somebody has to go and set something, and `failed` is red because
  something went wrong on its own
*/
const OUTCOMES = {
  ok: { variant: "secondary", icon: CheckIcon, tone: "" },
  skipped: { variant: "outline", icon: MinusIcon, tone: "" },
  /* somebody has to go and set something, which is not the same as something
     having gone wrong on its own — so not the same red */
  misconfigured: {
    variant: "outline",
    icon: WrenchIcon,
    tone: "border-amber-500/40 text-amber-700 dark:text-amber-500",
  },
  failed: { variant: "destructive", icon: TriangleAlertIcon, tone: "" },
} as const satisfies Record<
  string,
  {
    variant: "secondary" | "outline" | "destructive";
    icon: typeof CheckIcon;
    tone: string;
  }
>;

/** what fired it, which is most of what "is this my fault" comes down to */
const SOURCES = {
  cron: { icon: ClockIcon, said: "the schedule, unattended" },
  manual: { icon: HandIcon, said: "fired by hand from the panel" },
  button: { icon: MousePointerClickIcon, said: "a button in discord" },
  command: { icon: TerminalIcon, said: "a slash command" },
} as const satisfies Record<string, { icon: typeof ClockIcon; said: string }>;

/*
  what a transition is called, in the words somebody would use for it. "was ok"
  described the previous row and left the reader to work out what that meant
  about this one; a reminder that stopped arriving is the thing worth saying
*/
const CHANGES = {
  broke: "started failing",
  recovered: "recovered",
  changed: "changed",
} as const;

function Outcome({ row }: { row: Enriched }) {
  const {
    variant,
    icon: Icon,
    tone,
  } = OUTCOMES[row.outcome as keyof typeof OUTCOMES] ?? OUTCOMES.failed;

  return (
    <span className="flex items-center gap-1.5 overflow-hidden">
      <Badge variant={variant} className={tone}>
        <Icon data-icon="inline-start" />
        {row.outcome}
      </Badge>

      {/* only ever on a cron row: the schedule is the thing that has a state
          to change. see `enrich` */}
      {row.change && (
        <Badge
          variant="ghost"
          className="text-muted-foreground shrink"
          title={`the scheduled ${row.action} before this one ended ${row.change.from}`}
        >
          {CHANGES[row.change.kind]}
        </Badge>
      )}
    </span>
  );
}

function Source({ source }: { source: LogRow["source"] }) {
  const { icon: Icon, said } =
    SOURCES[source as keyof typeof SOURCES] ?? SOURCES.manual;

  return (
    <Badge variant="outline" title={said}>
      <Icon data-icon="inline-start" />
      {source}
    </Badge>
  );
}

/*
  a timestamp reads two ways and a log needs both. "4m ago" is the one that
  answers "is this the run I just fired"; the exact local time is the one you
  put next to a discord message to line them up.

  the relative half appears only after mount. astro renders this on the server,
  where "4m ago" was true whenever the html was built rather than when it is
  being read, and a page that hydrated to a different string would be a
  hydration error on top of a lie
*/
const EXACT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "medium",
});

const SHORT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function When({ at }: { at: number }) {
  const now = useNow();

  return (
    <span
      className="flex flex-col whitespace-nowrap"
      title={EXACT.format(at * 1000)}
    >
      <span>{SHORT.format(at * 1000)}</span>
      <span className="text-muted-foreground text-xs">
        {now ? ago(at, now) : "\u00a0"}
      </span>
    </span>
  );
}

function Actor({
  id,
  actors,
  onPick,
}: {
  id: string | null;
  actors: Directory;
  onPick?: (id: string) => void;
}) {
  if (!id) return <span className="text-muted-foreground">—</span>;

  const profile = actors[id];

  return (
    <button
      type="button"
      onClick={onPick ? () => onPick(id) : undefined}
      title={
        profile
          ? `@${profile.username} · ${id}${onPick ? " · click to filter" : ""}`
          : `${id} — not in the server, or discord could not be reached`
      }
      className={cn(
        "flex items-center gap-1.5 rounded-full py-0.5 text-left",
        onPick && "hover:bg-muted -mx-1.5 px-1.5",
      )}
    >
      {profile ? (
        <img
          src={profile.avatarUrl}
          alt=""
          width={20}
          height={20}
          className="size-5 shrink-0 rounded-full"
        />
      ) : (
        <span className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full">
          <SlashIcon className="size-3" />
        </span>
      )}
      <span className={cn("truncate", !profile && "font-mono text-xs")}>
        {profile?.displayName ?? id}
      </span>
    </button>
  );
}

/** a copy button that says whether it worked, and stops talking about it */
function Copy({
  what,
  text,
  icon,
  children,
}: {
  what: string;
  text: () => string;
  icon: ReactNode;
  children: string;
}) {
  const [done, setDone] = useState<boolean | null>(null);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard
          .writeText(text())
          .then(() => setDone(true))
          .catch((error: unknown) => {
            /* the clipboard refuses when the document is not focused or
               permission was withheld, and silence would be the only sign */
            console.error(`could not copy the ${what}`, error);
            setDone(false);
          })
          .finally(() => setTimeout(() => setDone(null), 1200));
      }}
    >
      {done === null ? icon : done ? <CheckIcon /> : <XIcon />}
      {done === false ? "Refused" : children}
    </Button>
  );
}

/**
 * the runs of this action either side of this one.
 *
 * this is the part a row cannot show. "did it fail this morning" and "has it
 * been failing all week" are different problems with the same row at the top,
 * and the second one is the reason ADR 0007 asked for a log rather than an
 * alert
 */
function History({ row, rows }: { row: Enriched; rows: Enriched[] }) {
  const runs = rows
    .filter((it) => it.action === row.action && it.source === row.source)
    .sort((a, b) => a.at - b.at)
    .slice(-16);

  if (runs.length < 2) return null;

  return (
    <div>
      <Field>
        {runs.length} recent {row.source === "cron" ? "scheduled runs" : "uses"}
      </Field>
      <div className="mt-1 flex items-end gap-1">
        {runs.map((run) => {
          const { tone } = OUTCOMES[run.outcome as keyof typeof OUTCOMES] ?? {};

          return (
            <span
              key={run.id}
              title={`${EXACT.format(run.at * 1000)} — ${run.outcome}`}
              className={cn(
                "h-5 w-2.5 rounded-xs",
                run.outcome === "ok" && "bg-foreground/30",
                run.outcome === "skipped" && "bg-foreground/10",
                run.outcome === "misconfigured" && "bg-amber-500/60",
                run.outcome === "failed" && "bg-destructive",
                tone === undefined && "bg-muted",
                run.id === row.id && "ring-foreground/60 h-6 ring-2",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/** the room the row does not have, and the context it cannot hold */
function Detail({
  row,
  rows,
  actors,
}: {
  row: Enriched;
  rows: Enriched[];
  actors: Directory;
}) {
  const profile = row.actor ? actors[row.actor] : undefined;

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm break-words">{row.summary}</p>

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <Field>Exactly</Field>
          <p className="text-sm">
            {EXACT.format(row.at * 1000)}{" "}
            <span className="text-muted-foreground">ET</span>
          </p>
          <p className="text-muted-foreground font-mono text-xs">
            {new Date(row.at * 1000).toISOString()} · {row.at}
          </p>
        </div>

        <div>
          <Field>Fired by</Field>
          <p className="text-sm">
            {SOURCES[row.source as keyof typeof SOURCES]?.said ?? row.source}
          </p>
          {row.actor && (
            <p className="text-muted-foreground text-xs">
              {profile ? `@${profile.username}` : "not resolved"} ·{" "}
              <span className="font-mono">{row.actor}</span>
            </p>
          )}
        </div>

        <History row={row} rows={rows} />
      </div>

      <div className="flex justify-end gap-2">
        <Copy
          what="link"
          icon={<LinkIcon />}
          text={() => {
            setParams({ row: String(row.id) });
            return window.location.href;
          }}
        >
          Copy link
        </Copy>
        <Copy
          what="json"
          icon={<CopyIcon />}
          text={() => JSON.stringify(row, null, 2)}
        >
          Copy JSON
        </Copy>
      </div>
    </div>
  );
}

const Field = ({ children }: { children: ReactNode }) => (
  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
    {children}
  </p>
);

/*
  one number the page is willing to raise its voice about, and four it is not.

  counting `failed` was counting two unrelated things: a section editor
  mistyping an Article title into a slash command, and the social team's 8am
  reminder never going out. the first is a person being told they made a
  mistake — the reply already said so, to the person who needed to hear it —
  and the second is the reason this page exists. a headline that adds them
  together is a headline nobody can act on
*/
function Overview({
  table,
  rows,
}: {
  table: Table<Enriched>;
  rows: Enriched[];
}) {
  const outcome = table.getColumn("outcome");
  const source = table.getColumn("source");
  const counts = outcome?.getFacetedUniqueValues();

  const wanting = rows.filter(needsAttention);
  /* the filter that shows exactly what the number counted, and nothing else */
  const showing =
    (source?.getFilterValue() as string[] | undefined)?.length === 1 &&
    (outcome?.getFilterValue() as string[] | undefined)?.length === 2;

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <button
        type="button"
        aria-pressed={showing}
        disabled={!wanting.length && !showing}
        onClick={() => {
          if (showing) {
            source?.setFilterValue(undefined);
            outcome?.setFilterValue(undefined);
          } else {
            source?.setFilterValue(["cron"]);
            outcome?.setFilterValue(["failed", "misconfigured"]);
          }
        }}
        className={cn(
          "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors",
          showing && "bg-muted border-foreground/30",
          wanting.length
            ? "border-destructive/40 hover:bg-destructive/5"
            : "hover:bg-muted/50",
          !wanting.length && !showing && "opacity-70",
        )}
      >
        {wanting.length ? (
          <TriangleAlertIcon className="text-destructive size-5 shrink-0" />
        ) : (
          <CheckIcon className="text-muted-foreground size-5 shrink-0" />
        )}
        <span>
          <span className="block leading-tight font-medium">
            {wanting.length
              ? `${wanting.length} unattended ${wanting.length === 1 ? "failure" : "failures"}`
              : "Nothing unattended failed"}
          </span>
          <span className="text-muted-foreground text-xs">
            scheduled runs that broke with nobody watching
          </span>
        </span>
      </button>

      <div className="text-muted-foreground ml-auto flex items-center gap-4 px-1 text-sm">
        {(Object.keys(OUTCOMES) as (keyof typeof OUTCOMES)[]).map((it) => (
          <span key={it} className="flex items-baseline gap-1.5">
            <span className="text-foreground tabular-nums">
              {counts?.get(it) ?? 0}
            </span>
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

/** how far back the table looks, in seconds, or null for everything kept */
const RANGES = [
  { id: "1h", label: "Last hour", seconds: 3600 },
  { id: "24h", label: "Last 24 hours", seconds: 86_400 },
  { id: "7d", label: "Last 7 days", seconds: 604_800 },
  { id: "30d", label: "Last 30 days", seconds: 2_592_000 },
  { id: "all", label: "Everything", seconds: null },
] as const;

export function InvocationLog({
  rows,
  actors = {},
}: {
  rows: LogRow[];
  actors?: Directory;
}) {
  /*
    the range narrows the data before the table sees it, so the counts, the
    facet dropdowns and the "n rows" all describe the same window. a tile
    reading "2 failed" over a table showing one because they counted different
    things is the sort of thing this page exists to not do
  */
  const [range, setRange] = useParam("range", "all");
  const now = useNow();

  const data = useMemo(() => {
    const enriched = enrich(rows);
    const seconds = RANGES.find((it) => it.id === range)?.seconds;
    /* and everything, before the clock has started: the server has no "now"
       that is still true by the time anybody reads the page */
    if (!seconds || !now) return enriched;

    const since = now / 1000 - seconds;
    return enriched.filter((row) => row.at >= since);
  }, [rows, range, now]);

  const columns = useMemo<ColumnDef<Enriched, unknown>[]>(
    () => [
      {
        accessorKey: "at",
        header: "When",
        size: 150,
        meta: { label: "When" },
        cell: ({ row }) => <When at={row.original.at} />,
      },
      {
        accessorKey: "source",
        header: "Source",
        size: 132,
        meta: { label: "Source" },
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id) as string),
        cell: ({ row }) => <Source source={row.original.source} />,
      },
      {
        accessorKey: "action",
        header: "Action",
        size: 190,
        meta: { label: "Action" },
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id) as string),
        cell: ({ row }) => (
          <span className="font-medium whitespace-nowrap">
            {row.original.action}
          </span>
        ),
      },
      {
        accessorKey: "outcome",
        header: "Outcome",
        size: 240,
        meta: { label: "Outcome" },
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id) as string),
        cell: ({ row }) => <Outcome row={row.original} />,
      },
      {
        accessorKey: "summary",
        header: "Summary",
        enableSorting: false,
        meta: { label: "Summary" },
        cell: ({ row }) => (
          <span className="text-muted-foreground line-clamp-2 max-w-prose whitespace-normal">
            {row.original.summary}
          </span>
        ),
      },
      {
        accessorKey: "actor",
        header: "Actor",
        size: 180,
        meta: {
          label: "Actor",
          /* the dropdown lists ids, because that is what the column holds; it
             should read as the people it is really listing */
          renderFacet: (id: string) => (
            <span className="flex items-center gap-1.5">
              <Actor id={id} actors={actors} />
            </span>
          ),
        },
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id) as string),
        /* by name, so sorting the column groups a person's runs together */
        sortingFn: (a, b) => {
          const name = (row: Enriched) =>
            row.actor ? (actors[row.actor]?.displayName ?? row.actor) : "";
          return name(a.original).localeCompare(name(b.original));
        },
        cell: ({ row, table }) => (
          <Actor
            id={row.original.actor}
            actors={actors}
            onPick={(id) => table.getColumn("actor")?.setFilterValue([id])}
          />
        ),
      },
    ],
    [actors],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => String(row.id)}
      initialSorting={[{ id: "at", desc: true }]}
      facets={[
        { id: "source", label: "Source" },
        { id: "action", label: "Action" },
        { id: "outcome", label: "Outcome" },
        { id: "actor", label: "Actor" },
      ]}
      /* by the name a person is called, not the id the column holds: typing
         somebody's nickname is how anybody actually looks for their runs */
      globalFilterFn={(row, _id, value: string) => {
        const it = row.original;
        const profile = it.actor ? actors[it.actor] : undefined;
        return [
          it.summary,
          it.action,
          it.source,
          it.outcome,
          it.actor,
          profile?.displayName,
          profile?.username,
        ]
          .join(" ")
          .toLowerCase()
          .includes(value.trim().toLowerCase());
      }}
      searchPlaceholder="Search the log…"
      empty="Nothing recorded yet."
      overview={(table) => <Overview table={table} rows={data} />}
      toolbar={() => (
        <select
          aria-label="Time range"
          value={range}
          onChange={(event) =>
            setRange(event.target.value === "all" ? null : event.target.value)
          }
          className="border-border bg-background h-9 rounded-md border px-2 text-sm"
        >
          {RANGES.map((it) => (
            <option key={it.id} value={it.id}>
              {it.label}
            </option>
          ))}
        </select>
      )}
      detail={(row) => <Detail row={row} rows={data} actors={actors} />}
      /* the same rule the headline counts by, so the marked rows and the
         number above them can never disagree */
      rowAccent={needsAttention}
    />
  );
}

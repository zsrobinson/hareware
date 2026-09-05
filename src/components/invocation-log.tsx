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
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "cn";
import { DataTable } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useNow } from "~/components/now";
import { setParams, useParam } from "~/components/url-state";
import type { Directory } from "~/lib/actors";
import { ago, enrich, type Enriched } from "~/lib/log-view";
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
  ok: { variant: "secondary", icon: CheckIcon },
  skipped: { variant: "outline", icon: MinusIcon },
  misconfigured: { variant: "destructive", icon: WrenchIcon },
  failed: { variant: "destructive", icon: TriangleAlertIcon },
} as const satisfies Record<
  string,
  { variant: "secondary" | "outline" | "destructive"; icon: typeof CheckIcon }
>;

/** what fired it, which is most of what "is this my fault" comes down to */
const SOURCES = {
  cron: { icon: ClockIcon, said: "the schedule, unattended" },
  manual: { icon: HandIcon, said: "fired by hand from the panel" },
  button: { icon: MousePointerClickIcon, said: "a button in discord" },
  command: { icon: TerminalIcon, said: "a slash command" },
} as const satisfies Record<string, { icon: typeof ClockIcon; said: string }>;

function Outcome({ row }: { row: Enriched }) {
  const { variant, icon: Icon } =
    OUTCOMES[row.outcome as keyof typeof OUTCOMES] ?? OUTCOMES.failed;

  return (
    <span className="flex items-center gap-1.5">
      <Badge variant={variant}>
        <Icon data-icon="inline-start" />
        {row.outcome}
      </Badge>
      {/* the row where something started going wrong, or stopped */}
      {row.changed && (
        <Badge
          variant="ghost"
          className="text-muted-foreground"
          title={`the previous ${row.source} run of ${row.action} was ${row.before}`}
        >
          was {row.before}
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

/** the whole of a row, for when the summary is the interesting part */
function Detail({ row, actors }: { row: Enriched; actors: Directory }) {
  const [said, setSaid] = useState<string | null>(null);

  function copy(what: string, text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setSaid(what);
        setTimeout(() => setSaid(null), 1200);
      })
      .catch((error: unknown) => {
        console.error("could not write to the clipboard", error);
        setSaid("clipboard refused");
      });
  }

  const profile = row.actor ? actors[row.actor] : undefined;

  return (
    <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto]">
      <div className="space-y-3">
        <div>
          <Field>Summary</Field>
          <p className="text-sm break-words">{row.summary}</p>
        </div>

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
          </div>

          {row.before && (
            <div>
              <Field>Previously</Field>
              <p className="text-sm">
                the run before this one ended {row.before}
              </p>
            </div>
          )}
        </div>

        {row.actor && (
          <div>
            <Field>Actor</Field>
            <div className="flex items-center gap-2">
              <Actor id={row.actor} actors={actors} />
              <span className="text-muted-foreground text-xs">
                {profile ? `@${profile.username}` : "unresolved"} ·{" "}
                <span className="font-mono">{row.actor}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setParams({ row: String(row.id) });
            copy("link", window.location.href);
          }}
        >
          <LinkIcon />
          Copy link
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => copy("json", JSON.stringify(row, null, 2))}
        >
          <CopyIcon />
          Copy JSON
        </Button>
        <span className="text-muted-foreground self-center text-xs">
          {said ? `copied the ${said}` : `row ${row.id}`}
        </span>
      </div>
    </div>
  );
}

const Field = ({ children }: { children: string }) => (
  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
    {children}
  </p>
);

/*
  the counts, and the fastest way to act on one. "three failed" is the first
  thing anybody wants from this page and the click that follows it is always
  the same click, so the number is the button
*/
function Overview({ table }: { table: Table<Enriched> }) {
  const column = table.getColumn("outcome");
  const counts = column?.getFacetedUniqueValues();
  const chosen = new Set((column?.getFilterValue() as string[]) ?? []);

  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(OUTCOMES) as (keyof typeof OUTCOMES)[]).map((outcome) => {
        const count = counts?.get(outcome) ?? 0;
        const on = chosen.has(outcome);
        const Icon = OUTCOMES[outcome].icon;

        return (
          <button
            key={outcome}
            type="button"
            aria-pressed={on}
            disabled={!count && !on}
            onClick={() => {
              const next = new Set(chosen);
              if (on) next.delete(outcome);
              else next.add(outcome);
              column?.setFilterValue(next.size ? [...next] : undefined);
            }}
            className={cn(
              "flex min-w-24 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors sm:flex-none",
              on ? "border-foreground/30 bg-muted" : "hover:bg-muted/50",
              !count && !on && "opacity-50",
              outcome === "failed" && count > 0 && "border-destructive/40",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                outcome === "failed" || outcome === "misconfigured"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            />
            <span>
              <span className="block text-lg leading-none font-medium tabular-nums">
                {count}
              </span>
              <span className="text-muted-foreground text-xs">{outcome}</span>
            </span>
          </button>
        );
      })}
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
        meta: { label: "When" },
        cell: ({ row }) => <When at={row.original.at} />,
      },
      {
        accessorKey: "source",
        header: "Source",
        meta: { label: "Source" },
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id) as string),
        cell: ({ row }) => <Source source={row.original.source} />,
      },
      {
        accessorKey: "action",
        header: "Action",
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
      overview={(table) => <Overview table={table} />}
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
      detail={(row) => <Detail row={row} actors={actors} />}
      /* the rows that changed something: the morning it broke, and the morning
         it started working again */
      rowAccent={(row) => row.changed && row.outcome !== "ok"}
    />
  );
}

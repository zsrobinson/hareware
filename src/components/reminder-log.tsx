import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, sortable } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import type { Row } from "~/lib/log";

/** what a run of the reminder did, in words */
const OUTCOMES: Record<Row["outcome"], string> = {
  ok: "Announced",
  skipped: "Nothing new",
  misconfigured: "Not set up",
  failed: "Failed",
};

/* a button press is not a run, so it does not say "Announced" */
const outcome = (row: Row) =>
  row.action === "mark-posted" && row.outcome === "ok"
    ? "Marked"
    : OUTCOMES[row.outcome];

/* `skipped` is a quiet morning, not a failure; `misconfigured` needs someone to set something */
const BADGES: Record<string, "secondary" | "outline" | "destructive"> = {
  ok: "secondary",
  skipped: "outline",
  misconfigured: "destructive",
  failed: "destructive",
};

const when = (at: number) =>
  new Date(at * 1000).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const SOURCES: Record<Row["source"], string> = {
  cron: "Schedule",
  manual: "Manual",
  button: "Someone",
  command: "Someone",
};

export function ReminderLog({
  rows,
  names,
}: {
  rows: Row[];
  names: Record<string, string>;
}) {
  const by = (row: Row) =>
    (row.actor && names[row.actor]) || SOURCES[row.source];

  const columns: ColumnDef<Row, unknown>[] = [
    {
      accessorKey: "at",
      header: sortable("When"),
      cell: ({ row }) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {when(row.original.at)}
        </span>
      ),
    },
    {
      id: "outcome",
      accessorFn: outcome,
      header: sortable("Outcome"),
      filterFn: (row, id, value: string[]) =>
        value.includes(row.getValue(id) as string),
      cell: ({ row }) => (
        <Badge variant={BADGES[row.original.outcome] ?? "destructive"}>
          {outcome(row.original)}
        </Badge>
      ),
    },
    {
      accessorKey: "summary",
      header: "What happened",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.summary}</span>
      ),
    },
    {
      id: "who",
      accessorFn: by,
      header: "By",
      cell: ({ row }) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {by(row.original)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      facets={[{ id: "outcome", label: "Outcome" }]}
      searchable={false}
      empty="Nothing recorded yet."
    />
  );
}

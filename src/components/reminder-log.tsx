import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, sortable } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import type { Row } from "~/lib/log";

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

export function ReminderLog({
  rows,
  names,
}: {
  rows: Row[];
  names: Record<string, string>;
}) {
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
      accessorKey: "outcome",
      header: sortable("Outcome"),
      filterFn: (row, id, value: string[]) =>
        value.includes(row.getValue(id) as string),
      cell: ({ row }) => (
        <Badge variant={BADGES[row.original.outcome] ?? "destructive"}>
          {row.original.outcome}
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
      accessorFn: (row) =>
        row.actor ? (names[row.actor] ?? row.actor) : row.source,
      header: "By",
      cell: ({ row }) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {row.original.actor
            ? (names[row.original.actor] ?? "someone")
            : row.original.source === "cron"
              ? "schedule"
              : row.original.source}
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

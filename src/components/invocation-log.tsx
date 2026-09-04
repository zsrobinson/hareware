import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDownIcon } from "lucide-react";
import { DataTable } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
    hour: "numeric",
    minute: "2-digit",
  });

/** a header that says it can be sorted, rather than leaving you to discover it */
function sortable(label: string) {
  const Header = ({
    column,
  }: {
    column: {
      toggleSorting: (d?: boolean) => void;
      getIsSorted: () => false | string;
    };
  }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDownIcon className="size-3.5 opacity-60" />
    </Button>
  );
  return Header;
}

const columns: ColumnDef<LogRow, unknown>[] = [
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
    accessorKey: "source",
    header: sortable("Source"),
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id) as string),
    cell: ({ row }) => <Badge variant="outline">{row.original.source}</Badge>,
  },
  {
    accessorKey: "action",
    header: sortable("Action"),
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id) as string),
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{row.original.action}</span>
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
    header: "Summary",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.summary}</span>
    ),
  },
  {
    accessorKey: "actor",
    header: "Actor",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.actor ?? "—"}</span>
    ),
  },
];

export function InvocationLog({ rows }: { rows: LogRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      facets={[
        { id: "source", label: "Source" },
        { id: "action", label: "Action" },
        { id: "outcome", label: "Outcome" },
      ]}
      searchPlaceholder="Search summaries…"
      empty="Nothing recorded yet."
    />
  );
}

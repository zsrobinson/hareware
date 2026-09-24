import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable, sortable } from "~/components/data-table";
import { MemberFace } from "~/components/member-face";
import { Badge } from "~/components/ui/badge";
import type { Faces } from "~/lib/faces";
import type { Row } from "~/lib/log";

export type LogRow = Row;

/* `skipped` is not a failure (ADR 0007); `misconfigured` needs someone to
   set something */
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

const columnsFor = (faces: Faces): ColumnDef<LogRow, unknown>[] => [
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
    cell: ({ row }) => {
      const actor = row.original.actor;
      /* no actor at all is the cron, which is not a person and gets no ghost */
      if (!actor) return <span className="text-muted-foreground">—</span>;

      const face = faces[actor];
      return (
        <span className="flex items-center gap-2 whitespace-nowrap">
          {/* the ghost, not initials made from a snowflake */}
          <MemberFace
            discordId={actor}
            name={face?.displayName ?? ""}
            faces={faces}
          />
          <span className="text-muted-foreground">
            {face?.displayName ?? actor}
          </span>
        </span>
      );
    },
  },
];

export function InvocationLog({
  rows,
  faces,
}: {
  rows: LogRow[];
  faces: Faces;
}) {
  const columns = useMemo(() => columnsFor(faces), [faces]);

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

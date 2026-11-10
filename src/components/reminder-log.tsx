import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, sortable } from "~/components/data-table";
import { useIsPhone } from "~/components/panel";
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

/* the day and the time apart, so a phone can break between them */
const when = (at: number) => {
  const date = new Date(at * 1000);
  const zone = { timeZone: "America/New_York" } as const;
  return {
    day: date.toLocaleDateString("en-US", {
      ...zone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-US", {
      ...zone,
      hour: "numeric",
      minute: "2-digit",
    }),
  };
};

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
  const phone = useIsPhone();
  const by = (row: Row) =>
    (row.actor && names[row.actor]) || SOURCES[row.source];

  const columns: ColumnDef<Row, unknown>[] = [
    {
      accessorKey: "at",
      header: sortable("When"),
      cell: ({ row }) => {
        const { day, time } = when(row.original.at);
        return (
          <span className="text-muted-foreground whitespace-normal">
            <span className="whitespace-nowrap">{day},</span>{" "}
            <span className="whitespace-nowrap">{time}</span>
          </span>
        );
      },
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
        /* wraps, so a phone's table fits without scrolling sideways */
        <span className="text-muted-foreground whitespace-normal">
          {row.original.summary}
        </span>
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
      /* who did it matters least, and a phone has no room for it */
      hidden={phone ? ["who"] : []}
    />
  );
}

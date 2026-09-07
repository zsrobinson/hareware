import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangleIcon, ArrowUpDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Link } from "~/components/ui/link";
import { Switch } from "~/components/ui/switch";
import { duplicates } from "~/lib/members/match";
import type { Corpus } from "~/lib/members/roster";
import {
  PRESETS,
  standings,
  type Preset,
  type Standing,
  type Thresholds,
} from "~/lib/members/standing";

/*
  the standing page: who satisfies these thresholds between these two dates.

  everything below the form is recomputed in the browser. `standings()` is a
  pure function over rows the astro page already read, so changing a threshold
  costs no request — which is why it was written that way, and why an editor
  can sit with this page and try the numbers the constitution might mean.

  three things this component refuses to do, all of them from ADR 0010:

  - it never shows only the people who qualify. The question people actually
    ask is "why did I fall short", and a filtered list cannot answer it.
  - it never treats an empty `Status` as a disqualification. Every row that
    predates this design has one, and a rule that silently denied them would
    disenfranchise the whole club at the first election.
  - it refuses to look final while unresolved near-matches exist, because a
    duplicate *denies* eligibility: somebody who attended three meetings and
    was typo'd once holds two attendances on one row and one on another, and
    fails a threshold they met. That warning is the most important thing on
    this page and is deliberately impossible to scroll past.
*/

/** the form, in the shape the inputs hold it: numbers are text while typing */
type Form = {
  from: string;
  to: string;
  /** empty means the clause is not part of the question — not "zero of them" */
  meetings: string;
  contributions: string;
  volunteer: string;
  currentStudentsOnly: boolean;
};

/** `YYYY-MM-DD` this many months before a day, for a preset's default window */
function monthsBefore(day: string, months: number): string {
  const [year, month, date] = day.split("-").map(Number);
  /* UTC throughout: this is date arithmetic on a label, not on a moment, and
     a local-time Date would shift the boundary by a day for half the year */
  const at = new Date(Date.UTC(year!, month! - 1, date!));
  at.setUTCMonth(at.getUTCMonth() - months);
  return at.toISOString().slice(0, 10);
}

function formFor(preset: Preset, today: string): Form {
  return {
    from: monthsBefore(today, preset.months),
    to: today,
    /* an omitted threshold renders as an empty box rather than as 0, because
       the two mean different things and `0` here would mean everybody
       qualifies on that clause */
    meetings: preset.thresholds.meetings?.toString() ?? "",
    contributions: preset.thresholds.contributions?.toString() ?? "",
    volunteer: preset.thresholds.volunteer?.toString() ?? "",
    currentStudentsOnly: preset.currentStudentsOnly,
  };
}

/**
 * a typed threshold as `standings` wants it.
 *
 * blank and unparseable both become "no clause". Coercing a half-typed box to
 * `0` mid-keystroke would flash the whole roster as qualifying, which for this
 * page is an alarming thing to see
 */
function threshold(value: string): number | undefined {
  const parsed = Number(value.trim());
  return value.trim() && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : undefined;
}

function thresholds(form: Form): Thresholds {
  return {
    meetings: threshold(form.meetings),
    contributions: threshold(form.contributions),
    volunteer: threshold(form.volunteer),
  };
}

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

const columns: ColumnDef<Standing, unknown>[] = [
  {
    id: "name",
    accessorFn: (row) => row.person.name,
    header: sortable("Name"),
    meta: { csvHeader: "name" },
    cell: ({ row }) => (
      <div className="min-w-40 space-y-1">
        <div className="font-medium">{row.original.person.name}</div>
        {row.original.person.email && (
          <div className="text-muted-foreground text-xs">
            {row.original.person.email}
          </div>
        )}
      </div>
    ),
  },
  {
    id: "qualifies",
    /* a string, not a boolean: the faceted filter builds its options from the
       values present and a checkbox column would offer `true` and `false` as
       unlabelled entries */
    accessorFn: (row) => (row.qualifies ? "Qualifies" : "Falls short"),
    header: sortable("Qualifies"),
    meta: { csvHeader: "qualifies" },
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id) as string),
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        <Badge variant={row.original.qualifies ? "default" : "outline"}>
          {row.original.qualifies ? "Qualifies" : "Falls short"}
        </Badge>
        {/* both flags are reasons an editor has something to do, so they are
            beside the answer rather than in a column somebody has to widen */}
        {row.original.excludedAsAlum && (
          <Badge variant="secondary">Excluded as alum</Badge>
        )}
        {row.original.statusUnknown && (
          <Badge variant="destructive">Status unknown</Badge>
        )}
      </div>
    ),
  },
  {
    id: "reasons",
    accessorFn: (row) => row.reasons.join("; "),
    header: "Reasons",
    meta: { csvHeader: "reasons" },
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {/* the em dash is the answer to "why did I fall short", so it is never
            blank: an empty cell reads as missing data rather than as none */}
        {row.original.reasons.join("; ") || "—"}
      </span>
    ),
  },
  count("meetings", "General body", (row) => row.meetings),
  count("volunteer", "Volunteer", (row) => row.volunteer),
  count("articles", "Articles", (row) => row.articles),
  count("images", "Images", (row) => row.images),
  count("contributions", "Contributions", (row) => row.contributions),
  {
    id: "status",
    accessorFn: (row) => row.person.status ?? "Unknown",
    header: sortable("Status"),
    meta: { csvHeader: "status" },
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id) as string),
    cell: ({ row }) => (
      <Badge variant={row.original.person.status ? "outline" : "destructive"}>
        {row.original.person.status ?? "Unknown"}
      </Badge>
    ),
  },
];

function count(
  id: string,
  label: string,
  of: (row: Standing) => number,
): ColumnDef<Standing, unknown> {
  return {
    id,
    accessorFn: of,
    header: sortable(label),
    meta: { csvHeader: id },
    cell: ({ row }) => <span className="tabular-nums">{of(row.original)}</span>,
  };
}

export function StandingTable({
  corpus,
  today,
}: {
  corpus: Corpus;
  today: string;
}) {
  const [presetId, setPresetId] = useState(PRESETS[0]!.id);
  const [form, setForm] = useState<Form>(() => formFor(PRESETS[0]!, today));

  const set = (patch: Partial<Form>) =>
    setForm((current) => ({ ...current, ...patch }));

  /*
    choosing a preset fills the form and then lets go of it. The numbers stay
    editable afterwards, and editing them does not clear the preset's name —
    ADR 0010 is explicit that the rule belongs to whoever owns it rather than
    to the code, so this is a starting point, not a mode
  */
  function choose(preset: Preset) {
    setPresetId(preset.id);
    setForm(formFor(preset, today));
  }

  const rows = useMemo(
    () =>
      standings(corpus.people, corpus.meetings, corpus.contributions, {
        from: form.from,
        to: form.to,
        thresholds: thresholds(form),
        currentStudentsOnly: form.currentStudentsOnly,
      }),
    [corpus, form],
  );

  /* recomputed from the same roster the table is drawn from, so the warning
     cannot disagree with what is on screen */
  const unresolved = useMemo(() => duplicates(corpus.people), [corpus.people]);

  const qualifying = rows.filter((row) => row.qualifies).length;
  const preset = PRESETS.find((one) => one.id === presetId);

  return (
    <div className="space-y-4">
      {unresolved.length > 0 && (
        /*
          the single most important thing on this page. it is a block at the
          top rather than a badge beside the count because the failure it warns
          about is invisible in the table below: a duplicated person's
          attendance is split across two rows, both of which look like honest
          near-misses
        */
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-foreground space-y-2 rounded-lg border p-4"
        >
          <div className="text-destructive flex items-center gap-2 font-medium">
            <AlertTriangleIcon className="size-4" />
            This list is not final: {unresolved.length} unresolved near-match
            {unresolved.length === 1 ? "" : "es"}
          </div>
          <p className="text-sm">
            {unresolved.length === 1
              ? "One group of rows looks"
              : "Some rows look"}{" "}
            like the same person entered twice. A duplicate{" "}
            <strong>denies</strong> eligibility rather than granting it —
            attendance split across two rows fails a threshold the person
            actually met — so the counts below may be short for{" "}
            {unresolved.flatMap((group) => group.people).length} people. Resolve
            these before the vote.
          </p>
          <ul className="text-muted-foreground list-inside list-disc text-sm">
            {unresolved.slice(0, 5).map((group) => (
              <li key={`${group.on}:${group.value}`}>
                {group.people.map((person) => person.name).join(" · ")}{" "}
                <span className="text-xs">(same {group.on})</span>
              </li>
            ))}
            {unresolved.length > 5 && (
              <li>…and {unresolved.length - 5} more</li>
            )}
          </ul>
          <Link href="/reconciler" variant="destructive" size="sm">
            Open the reconciler
          </Link>
        </div>
      )}

      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((one) => (
            <Button
              key={one.id}
              size="sm"
              variant={one.id === presetId ? "default" : "outline"}
              aria-pressed={one.id === presetId}
              onClick={() => choose(one)}
            >
              {one.name}
            </Button>
          ))}
        </div>

        {preset && (
          <p className="text-muted-foreground text-sm">{preset.description}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="standing-from">From</Label>
            <Input
              id="standing-from"
              type="date"
              value={form.from}
              onChange={(event) => set({ from: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="standing-to">To</Label>
            <Input
              id="standing-to"
              type="date"
              value={form.to}
              onChange={(event) => set({ to: event.target.value })}
            />
          </div>

          {(
            [
              ["meetings", "General body meetings"],
              ["contributions", "Contributions"],
              ["volunteer", "Volunteer events"],
            ] as const
          ).map(([field, label]) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`standing-${field}`}>{label} ≥</Label>
              <Input
                id={`standing-${field}`}
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="not asked"
                value={form[field]}
                onChange={(event) => set({ [field]: event.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="standing-current"
            checked={form.currentStudentsOnly}
            onCheckedChange={(on) => set({ currentStudentsOnly: on })}
          />
          <Label htmlFor="standing-current">
            Exclude alumni
            <span className="text-muted-foreground font-normal">
              — the constitution restricts voting to current members; the
              masthead prints anyone who contributed
            </span>
          </Label>
        </div>

        <p className="text-muted-foreground text-sm">
          {/* the clauses are an OR, and a form of three boxes reads like an AND
              unless it says otherwise */}
          A person qualifies by meeting <strong>any one</strong> of the
          thresholds above. An empty box is a clause that is not asked about —
          not a threshold of zero. {qualifying} of {rows.length} people qualify
          between {form.from} and {form.to}.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        facets={[
          { id: "qualifies", label: "Qualifies" },
          { id: "status", label: "Status" },
        ]}
        searchPlaceholder="Search names…"
        empty="No members yet."
        csv={{ filename: `standing-${presetId}` }}
      />
    </div>
  );
}

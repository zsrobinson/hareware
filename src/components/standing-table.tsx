import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangleIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable, sortable } from "~/components/data-table";
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
  type Combine,
  type Met,
  type Preset,
  type Standing,
  type Thresholds,
} from "~/lib/members/standing";

/*
  the standing page: who satisfies these thresholds between these two dates.

  everything below the form is recomputed in the browser. `standings()` is a
  pure function over rows the astro page already read, so changing a threshold
  costs no request, and an editor can sit with this page and try the numbers
  the constitution might mean.

  three things this component refuses to do, all of them from ADR 0010:

  - it never shows only the people who qualify. The question people actually
    ask is "why did I fall short", and a filtered list cannot answer it.
  - it never treats an empty `Status` as a disqualification. Every row that
    predates this design has one, and a rule that silently denied them would
    disenfranchise the whole club at the first election.
  - it refuses to look final while unresolved near-matches exist, because a
    duplicate *denies* eligibility: somebody who attended three meetings and
    was typo'd once holds two attendances on one row and one on another, and
    fails a threshold they met.
*/

/** the form, in the shape the inputs hold it: numbers are text while typing */
type Form = {
  from: string;
  to: string;
  /** empty means the clause is not part of the question, not "zero of them" */
  meetings: string;
  contributions: string;
  volunteer: string;
  combine: Combine;
  currentStudentsOnly: boolean;
};

/** the preset chip for a form that matches none of them */
const CUSTOM = "custom";

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
    combine: preset.combine,
    currentStudentsOnly: preset.currentStudentsOnly,
  };
}

function same(a: Form, b: Form): boolean {
  return (Object.keys(a) as (keyof Form)[]).every((key) => a[key] === b[key]);
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

/**
 * the columns, which depend on how the clauses combine.
 *
 * under OR the count that satisfied a clause is bold, so the row says which
 * one carried it. under AND every clause that was set had to pass, so there is
 * nothing to single out
 */
function columnsFor(combine: Combine): ColumnDef<Standing, unknown>[] {
  const bold = combine === "or";

  return [
    {
      id: "name",
      accessorFn: (row) => row.person.name,
      header: sortable("Name"),
      meta: { csvHeader: "name" },
      cell: ({ row }) => (
        <div className="min-w-40 font-medium">{row.original.person.name}</div>
      ),
    },
    /*
      its own column, not only the line under the name.

      the export is the club's whole TerpLink integration and the source of the
      addresses for the Google Group, and a `data-table` csv is built from
      column accessors — an email rendered only inside the name cell's jsx is
      invisible to it, so the file would carry names and no way to reach anybody
    */
    {
      id: "email",
      accessorFn: (row) => row.person.email ?? "",
      header: sortable("Email"),
      meta: { csvHeader: "email" },
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {row.original.person.email ?? "—"}
        </span>
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
    count(
      "meetings",
      "General body",
      (row) => row.meetings,
      bold && "meetings",
    ),
    count(
      "volunteer",
      "Volunteer",
      (row) => row.volunteer,
      bold && "volunteer",
    ),
    count("articles", "Articles", (row) => row.articles),
    count("images", "Images", (row) => row.images),
    count(
      "contributions",
      "Contributions",
      (row) => row.contributions,
      bold && "contributions",
    ),
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
}

function count(
  id: string,
  label: string,
  of: (row: Standing) => number,
  /** the clause this count answers, when a met one should be emphasised */
  clause: keyof Met | false = false,
): ColumnDef<Standing, unknown> {
  return {
    id,
    accessorFn: of,
    header: sortable(label),
    meta: { csvHeader: id },
    cell: ({ row }) => (
      <span
        className={
          clause && row.original.met[clause]
            ? "font-semibold tabular-nums"
            : "tabular-nums"
        }
      >
        {of(row.original)}
      </span>
    ),
  };
}

export function StandingTable({
  corpus,
  today,
}: {
  corpus: Corpus;
  today: string;
}) {
  const [presetId, setPresetId] = useState<string>(PRESETS[0]!.id);
  const [form, setForm] = useState<Form>(() => formFor(PRESETS[0]!, today));

  /*
    editing anything away from the chosen preset's values is what selects
    Custom, so the chip always describes the question on screen. editing back
    to a preset's values re-selects it
  */
  function set(patch: Partial<Form>) {
    const next = { ...form, ...patch };
    setForm(next);
    setPresetId(
      PRESETS.find((one) => same(next, formFor(one, today)))?.id ?? CUSTOM,
    );
  }

  const rows = useMemo(
    () =>
      standings(corpus.people, corpus.meetings, corpus.contributions, {
        from: form.from,
        to: form.to,
        thresholds: thresholds(form),
        combine: form.combine,
        currentStudentsOnly: form.currentStudentsOnly,
      }),
    [corpus, form],
  );

  const columns = useMemo(() => columnsFor(form.combine), [form.combine]);

  /* recomputed from the same roster the table is drawn from, so the warning
     cannot disagree with what is on screen */
  const unresolved = useMemo(() => duplicates(corpus.people), [corpus.people]);

  const qualifying = rows.filter((row) => row.qualifies).length;

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
            A duplicate <strong>denies</strong> eligibility, so the counts below
            may be short for{" "}
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

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Preset</Label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((one) => (
              <Button
                key={one.id}
                size="sm"
                variant={one.id === presetId ? "default" : "outline"}
                aria-pressed={one.id === presetId}
                onClick={() => {
                  setPresetId(one.id);
                  setForm(formFor(one, today));
                }}
              >
                {one.name}
              </Button>
            ))}
            {/* selectable so the chip is not a state you can only fall into:
                pressing it keeps the numbers and lets go of the preset */}
            <Button
              size="sm"
              variant={presetId === CUSTOM ? "default" : "outline"}
              aria-pressed={presetId === CUSTOM}
              onClick={() => setPresetId(CUSTOM)}
            >
              Custom
            </Button>
          </div>
        </div>

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

        <div className="flex flex-wrap items-center gap-6">
          <div className="space-y-1.5">
            <Label>Combine thresholds</Label>
            <div className="flex gap-2">
              {(
                [
                  ["or", "Any (OR)"],
                  ["and", "All (AND)"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={form.combine === value ? "default" : "outline"}
                  aria-pressed={form.combine === value}
                  onClick={() => set({ combine: value })}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-5">
            <Switch
              id="standing-current"
              checked={form.currentStudentsOnly}
              onCheckedChange={(on) => set({ currentStudentsOnly: on })}
            />
            <Label htmlFor="standing-current">Exclude alumni</Label>
          </div>
        </div>

        <p className="text-muted-foreground text-sm">
          {qualifying} of {rows.length} qualify between {form.from} and{" "}
          {form.to}.
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
        csv={`standing-${presetId}`}
      />
    </div>
  );
}

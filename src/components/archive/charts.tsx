import { ChevronRightIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { ROLE_NAMES, type Role } from "~/lib/credits/labels";
import {
  applyFilters,
  easternDate,
  group,
  periodBounds,
  type Dimension,
  type Filters,
  type Grouped,
  type Measure,
  type Period,
} from "~/lib/credits/stats";
import { cn } from "~/lib/utils";
import { ArchiveShell, type ViewProps } from "./archive-shell";
import { Choice } from "./choice";
import { seriesColor, seriesOrder } from "./colors";

type Breakdown = "none" | "section" | "role";
type Kind = "bars" | "lines";
type Scale = "count" | "share";

type Config = {
  measure: Measure;
  by: Dimension;
  breakdown: Breakdown;
  kind: Kind;
  scale: Scale;
};

const MEASURES: { id: Measure; label: string }[] = [
  { id: "articles", label: "Articles" },
  { id: "contributions", label: "Contributions" },
];
const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: "semester", label: "Semester" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "section", label: "Section" },
  { id: "person", label: "Person" },
  { id: "role", label: "Role" },
];

/* the questions the board actually asks, one click each */
/* the questions the board actually asks, one click each */
const QUICK: { label: string; config: Config }[] = [
  {
    label: "Sections over time",
    config: {
      measure: "articles",
      by: "semester",
      breakdown: "section",
      kind: "bars",
      scale: "count",
    },
  },
  {
    label: "Section mix",
    config: {
      measure: "articles",
      by: "semester",
      breakdown: "section",
      kind: "bars",
      scale: "share",
    },
  },
  {
    label: "Contributors",
    config: {
      measure: "contributions",
      by: "person",
      breakdown: "role",
      kind: "bars",
      scale: "count",
    },
  },
  {
    label: "Section totals",
    config: {
      measure: "articles",
      by: "section",
      breakdown: "none",
      kind: "bars",
      scale: "count",
    },
  },
];

const isPeriod = (dimension: Dimension): dimension is Period =>
  dimension === "month" || dimension === "semester" || dimension === "year";

export function ChartsPage() {
  return <ArchiveShell>{(props) => <Charts {...props} />}</ArchiveShell>;
}

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** what the caption says was added up, so a number is never read as the wrong unit */
function unitLine(grouped: Grouped, by: Dimension, inView: number) {
  const missing =
    inView > grouped.articles && grouped.measure === "contributions"
      ? ` ${plural(inView - grouped.articles, "article credits", "articles credit")} no one.`
      : "";
  const counted =
    grouped.measure === "contributions"
      ? `${plural(grouped.total, "contribution", "contributions")} on ${plural(grouped.articles, "article", "articles")}`
      : plural(grouped.total, "article", "articles");
  if (by === "person" && grouped.categories.length < grouped.available)
    return `Top ${grouped.categories.length} of ${plural(grouped.available, "person", "people")}. ${counted}.${missing}`;
  return `${counted}.${missing}`;
}

/** which periods the chart cannot show whole: still running, or cut by the filter */
function partialKeys(grouped: Grouped, by: Dimension, filters: Filters) {
  const partial = new Set<string>();
  if (!isPeriod(by)) return partial;
  const today = easternDate(new Date().toISOString());
  for (const category of grouped.categories) {
    const { from, to } = periodBounds(category.key, by);
    if (
      to > today ||
      (filters.from && from < filters.from) ||
      (filters.to && to > filters.to)
    )
      partial.add(category.key);
  }
  return partial;
}

function Charts({ archive, filters }: ViewProps) {
  const [config, setConfig] = useState<Config>(QUICK[0]!.config);
  const [limit, setLimit] = useState(25);
  const [hidden, setHidden] = useState<string[]>([]);
  const { measure, by, breakdown, kind, scale } = config;
  const set = (patch: Partial<Config>) =>
    setConfig((now) => ({ ...now, ...patch }));

  const shown = useMemo(
    () => applyFilters(archive.articles, filters),
    [archive, filters],
  );
  const split: Breakdown = breakdown === by ? "none" : breakdown;
  const grouped = useMemo(() => {
    const raw = group(shown, {
      measure,
      by,
      breakdown: split,
      filters,
      limit: isPeriod(by) ? undefined : limit,
    });
    return { ...raw, series: seriesOrder(raw.series, split) };
  }, [shown, measure, by, split, filters, limit]);

  const visible = useMemo(
    () => ({
      ...grouped,
      series: grouped.series.filter((s) => !hidden.includes(s.key)),
    }),
    [grouped, hidden],
  );

  const drawLines = isPeriod(by) && kind === "lines";
  const asShare = scale === "share" && split !== "none" && !drawLines;
  const partial = useMemo(
    () => partialKeys(grouped, by, filters),
    [grouped, by, filters],
  );

  const title = `${MEASURES.find((m) => m.id === grouped.measure)!.label} by ${DIMENSIONS.find((d) => d.id === by)!.label.toLowerCase()}${
    split === "none" ? "" : `, split by ${split}`
  }${asShare ? ", in percent" : ""}`;

  const active = QUICK.find(
    (q) => JSON.stringify(q.config) === JSON.stringify(config),
  );
  const [customizing, setCustomizing] = useState(false);

  return (
    <div className="space-y-4">
      <figure className="bg-card rounded-xl border">
        {/* the questions first; the knobs behind them */}
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div
            role="tablist"
            aria-label="Quick views"
            className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1"
          >
            {QUICK.map((quick) => (
              <button
                key={quick.label}
                type="button"
                role="tab"
                aria-selected={active === quick}
                onClick={() => {
                  setConfig(quick.config);
                  setHidden([]);
                }}
                className={cn(
                  /* the active view is underlined, so a hovered tab never looks chosen */
                  "-mb-2 h-10 shrink-0 border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
                  active === quick
                    ? "border-foreground text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {quick.label}
              </button>
            ))}
          </div>
          <Button
            variant={customizing ? "secondary" : "ghost"}
            size="sm"
            aria-expanded={customizing}
            onClick={() => setCustomizing(!customizing)}
          >
            <SlidersHorizontalIcon /> Customize
          </Button>
        </div>
        {customizing && (
          <div className="flex flex-wrap items-end gap-3 border-b px-4 py-3 sm:px-5">
            <Choice
              label="Count"
              value={grouped.measure}
              options={MEASURES.map((m) => ({
                ...m,
                /* a person or a role is counted in contributions */
                disabled:
                  m.id === "articles" &&
                  [by, split].some((d) => d === "person" || d === "role"),
              }))}
              onChange={(measure) => set({ measure })}
            />
            <Choice
              label="Grouped by"
              value={by}
              options={DIMENSIONS}
              onChange={(by) => set({ by })}
            />
            <Choice
              label="Split by"
              value={breakdown}
              options={[
                { id: "none", label: "Nothing" },
                { id: "section", label: "Section", disabled: by === "section" },
                { id: "role", label: "Role", disabled: by === "role" },
              ]}
              onChange={(breakdown) => {
                set({ breakdown });
                setHidden([]);
              }}
            />
            {isPeriod(by) ? (
              <Choice
                label="Draw as"
                value={kind}
                options={[
                  { id: "bars", label: "Columns" },
                  { id: "lines", label: "Lines" },
                ]}
                onChange={(kind) => set({ kind })}
              />
            ) : (
              <Choice
                label="Show"
                value={String(limit)}
                options={["10", "25", "50", "1000"].map((n) => ({
                  id: n,
                  label: n === "1000" ? "Everyone" : `Top ${n}`,
                }))}
                onChange={(value) => setLimit(Number(value))}
              />
            )}
            {split !== "none" && !drawLines && (
              <Choice
                label="Values"
                value={scale}
                options={[
                  { id: "count", label: "Counts" },
                  { id: "share", label: "Percent" },
                ]}
                onChange={(scale) => set({ scale })}
              />
            )}
          </div>
        )}

        <div className="space-y-4 p-4 sm:p-5">
          <figcaption className="space-y-1">
            <div className="font-medium">{title}</div>
            <div className="text-muted-foreground text-sm">
              {unitLine(grouped, by, shown.length)}
              {partial.size > 0 && (
                <span
                  className="ml-2 inline-flex items-center gap-1 align-middle"
                  title="Still running, or cut off by the period filter"
                >
                  <HatchSwatch />
                  partly counted
                </span>
              )}
            </div>
          </figcaption>
          {grouped.categories.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              Nothing matches these filters.
            </p>
          ) : (
            <>
              <Legend
                grouped={grouped}
                dimension={split}
                lines={drawLines}
                hidden={hidden}
                onToggle={(key) =>
                  setHidden((now) =>
                    now.includes(key)
                      ? now.filter((k) => k !== key)
                      : [...now, key],
                  )
                }
              />
              {isPeriod(by) ? (
                <TimeChart
                  grouped={visible}
                  all={grouped}
                  dimension={split}
                  lines={drawLines}
                  share={asShare}
                  partial={partial}
                />
              ) : (
                <BarChart
                  grouped={visible}
                  all={grouped}
                  dimension={split}
                  share={asShare}
                />
              )}
            </>
          )}
        </div>
      </figure>

      <NumbersTable grouped={grouped} dimension={split} partial={partial} />
    </div>
  );
}

const seriesLabel = (key: string, label: string, dimension: Breakdown) =>
  dimension === "role"
    ? (ROLE_NAMES[key as Role] ?? label)
    : dimension === "none"
      ? "Total"
      : label;

function HatchSwatch() {
  return (
    <svg width="12" height="12" aria-hidden className="text-muted-foreground">
      <rect
        width="12"
        height="12"
        rx="2"
        className="fill-muted-foreground/40"
      />
      <path
        d="M-2,4 l6,-6 M0,12 l12,-12 M8,14 l6,-6"
        className="stroke-card"
        strokeWidth="2"
      />
    </svg>
  );
}

function Legend({
  grouped,
  dimension,
  lines,
  hidden,
  onToggle,
}: {
  grouped: Grouped;
  dimension: Breakdown;
  lines: boolean;
  hidden: string[];
  onToggle: (key: string) => void;
}) {
  /* one series is named by the title */
  if (grouped.series.length < 2) return null;
  const keys = grouped.series.map((s) => s.key);
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
      {grouped.series.map((series) => {
        const off = hidden.includes(series.key);
        return (
          <button
            key={series.key}
            type="button"
            aria-pressed={!off}
            title={off ? "Show" : "Hide"}
            onClick={() => onToggle(series.key)}
            className={cn(
              "hover:bg-muted flex items-center gap-1.5 rounded-md px-1.5 py-0.5",
              off && "text-muted-foreground line-through opacity-60",
            )}
          >
            <span
              aria-hidden
              className={
                lines ? "h-0.5 w-3.5 rounded-full" : "size-3 rounded-sm"
              }
              style={{ background: seriesColor(series.key, keys, dimension) }}
            />
            {seriesLabel(series.key, series.label, dimension)}
          </button>
        );
      })}
    </div>
  );
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry!.contentRect.width),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** where the mark is, so the tooltip can sit beside it rather than on it */
type Hover = { key: string; left: number; right: number; y: number } | null;

const sum = (row: Record<string, number>, keys: string[]) =>
  keys.reduce((total, key) => total + (row[key] ?? 0), 0);

const TOOLTIP_WIDTH = 200;

function Tooltip({
  grouped,
  hover,
  dimension,
  width,
  partial,
}: {
  grouped: Grouped;
  hover: Hover;
  dimension: Breakdown;
  width: number;
  partial?: Set<string>;
}) {
  if (!hover) return null;
  const category = grouped.categories.find((c) => c.key === hover.key);
  if (!category) return null;
  const row = grouped.values[hover.key] ?? {};
  const keys = grouped.series.map((s) => s.key);
  const total = sum(row, keys);
  /* to the right of the mark when it fits, else to its left */
  const left =
    hover.right + 12 + TOOLTIP_WIDTH <= width
      ? hover.right + 12
      : Math.max(0, hover.left - 12 - TOOLTIP_WIDTH);

  return (
    <div
      role="tooltip"
      className="bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{ left, top: hover.y, width: TOOLTIP_WIDTH }}
    >
      <div className="text-muted-foreground mb-1">
        {category.label}
        {partial?.has(category.key) && " (partly counted)"}
      </div>
      {grouped.series.length > 1 &&
        [...grouped.series]
          .reverse()
          .filter((series) => row[series.key])
          .map((series) => (
            <div key={series.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ background: seriesColor(series.key, keys, dimension) }}
              />
              <span className="font-semibold tabular-nums">
                {row[series.key]}
              </span>
              <span className="text-muted-foreground truncate">
                {seriesLabel(series.key, series.label, dimension)}
              </span>
              <span className="text-muted-foreground ml-auto pl-2 tabular-nums">
                {Math.round((row[series.key]! / total) * 100)}%
              </span>
            </div>
          ))}
      <div
        className={cn(
          "flex gap-2",
          grouped.series.length > 1 && "mt-1 border-t pt-1",
        )}
      >
        <span className="font-semibold tabular-nums">{total}</span>
        <span className="text-muted-foreground">total</span>
      </div>
    </div>
  );
}

function Readout({
  grouped,
  hover,
  dimension,
  partial,
  share,
  lines,
}: {
  grouped: Grouped;
  hover: Hover;
  dimension: Breakdown;
  partial: Set<string>;
  share: boolean;
  lines: boolean;
}) {
  const category = hover && grouped.categories.find((c) => c.key === hover.key);
  const keys = grouped.series.map((s) => s.key);
  return (
    <div
      aria-live="polite"
      /* over the plot's top margin, so it takes no room until it has something to say */
      className="bg-card absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
    >
      {!category ? (
        <span aria-hidden />
      ) : (
        <>
          <span className="font-medium">
            {category.label}
            {partial.has(category.key) && (
              <span className="text-muted-foreground font-normal">
                {" "}
                (partly counted)
              </span>
            )}
          </span>
          <span className="tabular-nums">
            <span className="font-semibold">
              {sum(grouped.values[category.key] ?? {}, keys)}
            </span>{" "}
            <span className="text-muted-foreground">total</span>
          </span>
          {grouped.series.length > 1 &&
            grouped.series
              .filter((series) => grouped.values[category.key]?.[series.key])
              .map((series) => (
                <span
                  key={series.key}
                  className="flex items-center gap-1.5 tabular-nums"
                >
                  <span
                    aria-hidden
                    className={
                      lines ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-sm"
                    }
                    style={{
                      background: seriesColor(series.key, keys, dimension),
                    }}
                  />
                  <span className="font-semibold">
                    {share
                      ? `${Math.round((grouped.values[category.key]![series.key]! / sum(grouped.values[category.key] ?? {}, keys)) * 100)}%`
                      : grouped.values[category.key]![series.key]}
                  </span>
                  {share && (
                    <span className="text-muted-foreground">
                      ({grouped.values[category.key]![series.key]})
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {seriesLabel(series.key, series.label, dimension)}
                  </span>
                </span>
              ))}
        </>
      )}
    </div>
  );
}

/** a clean axis: the smallest round step that keeps it to seven intervals or fewer */
function axis(peak: number) {
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500]) {
    const max = Math.ceil(Math.max(peak, 1) / step) * step;
    if (max / step <= 7) {
      const ticks = [];
      for (let t = 0; t <= max; t += step) ticks.push(t);
      return { max, ticks };
    }
  }
  return { max: peak, ticks: [0, peak] };
}

/** "Fall 2022" → "F22" when every label must fit */
function shortLabel(label: string) {
  const term = /^(Spring|Fall) (\d{4})$/.exec(label);
  if (term) return `${term[1] === "Spring" ? "Sp" : "F"}${term[2]!.slice(2)}`;
  const month = /^(\w{3}) (\d{4})$/.exec(label);
  if (month) return `${month[1]} ’${month[2]!.slice(2)}`;
  return label;
}

/** a column's top two corners rounded, its base square */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`;
}

function rightRounded(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h - radius}Q${x + w},${y + h} ${x + w - radius},${y + h}H${x}Z`;
}

function TimeChart({
  grouped,
  all,
  dimension,
  lines,
  share,
  partial,
}: {
  grouped: Grouped;
  all: Grouped;
  dimension: Breakdown;
  lines: boolean;
  share: boolean;
  partial: Set<string>;
}) {
  const { ref, width } = useWidth();
  const hatch = `hatch-${useId().replace(/:/g, "")}`;
  const [hover, setHover] = useState<Hover>(null);
  const counted = share;
  const height = 280 + (counted ? 14 : 0);
  const endLabels = lines && grouped.series.length <= 5 && width > 480;
  const margin = {
    top: 28,
    right: endLabels ? 104 : 8,
    bottom: counted ? 44 : 30,
    left: share ? 44 : 36,
  };
  const plotW = Math.max(100, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const keys = grouped.series.map((s) => s.key);
  const allKeys = all.series.map((s) => s.key);

  const value = (categoryKey: string, seriesKey: string) => {
    const row = grouped.values[categoryKey] ?? {};
    const raw = row[seriesKey] ?? 0;
    if (!share) return raw;
    const total = sum(row, keys);
    return total ? (raw / total) * 100 : 0;
  };
  const rawTotals = grouped.categories.map((c) =>
    sum(grouped.values[c.key] ?? {}, keys),
  );
  const totals = share ? rawTotals.map(() => 100) : rawTotals;
  const peak = lines
    ? Math.max(
        1,
        ...grouped.categories.flatMap((c) => keys.map((k) => value(c.key, k))),
      )
    : Math.max(1, ...totals);
  const { max, ticks } = share
    ? { max: 100, ticks: [0, 25, 50, 75, 100] }
    : axis(peak);
  const band = plotW / grouped.categories.length;
  const barW = Math.min(24, band * 0.68);
  const y = (v: number) => margin.top + plotH - (v / max) * plotH;
  const cx = (index: number) => margin.left + band * index + band / 2;

  /* every label when they fit, short forms when that makes them fit, and only then every nth */
  const longest = Math.max(...grouped.categories.map((c) => c.label.length));
  const short = longest * 6.5 > band - 4;
  const shortest = Math.max(
    ...grouped.categories.map((c) => shortLabel(c.label).length),
  );
  const every = short ? Math.max(1, Math.ceil((shortest * 6.5 + 6) / band)) : 1;

  /* line-end labels, spread apart so converging lines never stack them */
  const labelY = new Map<string, number>();
  if (endLabels && grouped.categories.length > 0) {
    const lastKey = grouped.categories[grouped.categories.length - 1]!.key;
    const ends = grouped.series
      .map((series) => ({ key: series.key, y: y(value(lastKey, series.key)) }))
      .sort((a, b) => a.y - b.y);
    /* top-down with 14px between them, then lifted if the last one fell below the axis */
    const placed: number[] = [];
    for (const end of ends)
      placed.push(Math.max(end.y, (placed.at(-1) ?? -Infinity) + 14));
    const overflow = Math.max(0, (placed.at(-1) ?? 0) - (margin.top + plotH));
    ends.forEach((end, i) =>
      labelY.set(end.key, Math.max(margin.top, placed[i]! - overflow)),
    );
  }

  const hoverAt = (key: string, index: number) =>
    setHover({
      key,
      left: cx(index) - band / 2,
      right: cx(index) + band / 2,
      y: margin.top,
    });

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {/* a fixed line above the plot rather than a box over it, so reading one
          column never hides another */}
      <Readout
        grouped={grouped}
        hover={hover}
        dimension={dimension}
        partial={partial}
        share={share}
        lines={lines}
      />
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Chart; the same numbers are in the table below"
        className="block overflow-visible"
      >
        <defs>
          <pattern
            id={hatch}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              className="stroke-card"
              strokeWidth="1.5"
            />
          </pattern>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={margin.left}
              x2={margin.left + plotW}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={margin.left - 8}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-xs tabular-nums"
            >
              {share ? `${tick}%` : tick}
            </text>
          </g>
        ))}

        {!lines &&
          grouped.categories.map((category, index) => {
            let base = 0;
            const present = grouped.series.filter(
              (s) => value(category.key, s.key) > 0,
            );
            const segments = present.map((series, i) => {
              const v = value(category.key, series.key);
              const top = y(base + v);
              const bottom = y(base);
              base += v;
              /* a 2px surface gap between stacked segments */
              const h = Math.max(1, bottom - top - (i > 0 ? 2 : 0));
              const d =
                i === present.length - 1
                  ? topRounded(cx(index) - barW / 2, top, barW, h, 4)
                  : `M${cx(index) - barW / 2},${top}h${barW}v${h}h${-barW}Z`;
              return { key: series.key, d };
            });
            return (
              <g key={category.key}>
                {segments.map((segment) => (
                  <path
                    key={segment.key}
                    d={segment.d}
                    style={{
                      fill: seriesColor(segment.key, allKeys, dimension),
                    }}
                  />
                ))}
                {/* the full colour stays; the hatching says "not the whole period" */}
                {partial.has(category.key) &&
                  segments.map((segment) => (
                    <path
                      key={segment.key}
                      d={segment.d}
                      fill={`url(#${hatch})`}
                    />
                  ))}
                {/* the total on the cap, where there is room for it */}
                {!share && band >= 28 && rawTotals[index]! > 0 && (
                  <text
                    x={cx(index)}
                    y={y(totals[index]!) - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground text-xs tabular-nums"
                  >
                    {rawTotals[index]}
                  </text>
                )}
              </g>
            );
          })}

        {grouped.categories.map((category, index) => (
          <g key={category.key}>
            {index % every === 0 && (
              <text
                x={cx(index)}
                y={y(0) + 18}
                textAnchor="middle"
                className={cn(
                  "text-xs",
                  hover?.key === category.key
                    ? "fill-foreground"
                    : "fill-muted-foreground",
                )}
              >
                {short ? shortLabel(category.label) : category.label}
              </text>
            )}
            {counted && index % every === 0 && (
              <text
                x={cx(index)}
                y={y(0) + 32}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                n={rawTotals[index]}
              </text>
            )}
            {/* the whole column is the hit target */}
            <rect
              x={margin.left + band * index}
              y={margin.top}
              width={band}
              height={plotH}
              fill="transparent"
              tabIndex={0}
              aria-label={`${category.label}: ${sum(all.values[category.key] ?? {}, allKeys)}`}
              onPointerEnter={() => hoverAt(category.key, index)}
              onFocus={() => hoverAt(category.key, index)}
            />
          </g>
        ))}

        {lines &&
          grouped.series.map((series) => {
            const points = grouped.categories.map((c, i) => ({
              key: c.key,
              x: cx(i),
              y: y(value(c.key, series.key)),
            }));
            const end = points[points.length - 1];
            /* the line into a partial period is dashed, so it is not read as a drop */
            return (
              <g
                key={series.key}
                style={{ color: seriesColor(series.key, allKeys, dimension) }}
                pointerEvents="none"
              >
                {points.slice(1).map((point, i) => (
                  <line
                    key={point.key}
                    x1={points[i]!.x}
                    y1={points[i]!.y}
                    x2={point.x}
                    y2={point.y}
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray={
                      partial.has(point.key) || partial.has(points[i]!.key)
                        ? "4 4"
                        : undefined
                    }
                  />
                ))}
                {points.length <= 40 &&
                  points.map((point) => (
                    <circle
                      key={point.key}
                      cx={point.x}
                      cy={point.y}
                      r={4}
                      fill={
                        partial.has(point.key) ? "var(--card)" : "currentColor"
                      }
                      stroke={
                        partial.has(point.key) ? "currentColor" : "var(--card)"
                      }
                      strokeWidth={2}
                    />
                  ))}
                {endLabels && end && (
                  <line
                    x1={end.x + 6}
                    x2={width - margin.right + 16}
                    y1={end.y}
                    y2={labelY.get(series.key) ?? end.y}
                    stroke="currentColor"
                    strokeWidth={1}
                  />
                )}
              </g>
            );
          })}
        {endLabels &&
          grouped.series.map((series) => (
            <text
              key={series.key}
              x={width - margin.right + 20}
              y={labelY.get(series.key)}
              dy="0.32em"
              className="fill-foreground text-xs"
            >
              {seriesLabel(series.key, series.label, dimension)}
            </text>
          ))}

        {hover && lines && (
          <line
            x1={cx(grouped.categories.findIndex((c) => c.key === hover.key))}
            x2={cx(grouped.categories.findIndex((c) => c.key === hover.key))}
            y1={margin.top}
            y2={margin.top + plotH}
            className="stroke-muted-foreground"
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
        <line
          x1={margin.left}
          x2={margin.left + plotW}
          y1={y(0)}
          y2={y(0)}
          className="stroke-muted-foreground/60"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}

function BarChart({
  grouped,
  all,
  dimension,
  share,
}: {
  grouped: Grouped;
  all: Grouped;
  dimension: Breakdown;
  share: boolean;
}) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<Hover>(null);
  const row = 26;
  const barH = 16;
  const labelW = Math.min(180, width * 0.38);
  const valueW = 44;
  const plotW = Math.max(60, width - labelW - valueW);
  const height = grouped.categories.length * row;
  const keys = grouped.series.map((s) => s.key);
  const allKeys = all.series.map((s) => s.key);
  const totals = grouped.categories.map((c) =>
    sum(grouped.values[c.key] ?? {}, keys),
  );
  const max = share ? 100 : Math.max(1, ...totals);
  const x = (v: number) => (v / max) * plotW;

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Chart; the same numbers are in the table below"
        className="block"
      >
        {grouped.categories.map((category, index) => {
          const top = index * row + (row - barH) / 2;
          const values = grouped.values[category.key] ?? {};
          const total = totals[index]!;
          let base = 0;
          const present = grouped.series.filter((s) => values[s.key]);
          const end = labelW + x(share ? 100 : total);
          return (
            <g key={category.key}>
              <text
                x={labelW - 10}
                y={index * row + row / 2}
                dy="0.32em"
                textAnchor="end"
                className="fill-foreground text-sm"
              >
                {category.label.length > 24
                  ? `${category.label.slice(0, 23)}…`
                  : category.label}
              </text>
              {present.map((series, i) => {
                const raw = values[series.key]!;
                const v = share ? (raw / total) * 100 : raw;
                const start = labelW + x(base) + (i > 0 ? 2 : 0);
                const w = Math.max(1, x(v) - (i > 0 ? 2 : 0));
                base += v;
                const fill = {
                  fill: seriesColor(series.key, allKeys, dimension),
                };
                return i === present.length - 1 ? (
                  <path
                    key={series.key}
                    d={rightRounded(start, top, w, barH, 4)}
                    style={fill}
                  />
                ) : (
                  <rect
                    key={series.key}
                    x={start}
                    y={top}
                    width={w}
                    height={barH}
                    style={fill}
                  />
                );
              })}
              {!share && (
                <text
                  x={end + 6}
                  y={index * row + row / 2}
                  dy="0.32em"
                  className="fill-muted-foreground text-xs tabular-nums"
                >
                  {total}
                </text>
              )}
              <rect
                x={0}
                y={index * row}
                width={width}
                height={row}
                fill="transparent"
                tabIndex={0}
                aria-label={`${category.label}: ${total}`}
                onPointerEnter={() =>
                  setHover({
                    key: category.key,
                    left: labelW,
                    right: end + 30,
                    y: top,
                  })
                }
                onFocus={() =>
                  setHover({
                    key: category.key,
                    left: labelW,
                    right: end + 30,
                    y: top,
                  })
                }
              />
            </g>
          );
        })}
        <line
          x1={labelW}
          x2={labelW}
          y1={0}
          y2={height}
          className="stroke-muted-foreground/60"
          strokeWidth={1}
        />
      </svg>
      <Tooltip
        grouped={grouped}
        hover={hover}
        dimension={dimension}
        width={width}
      />
    </div>
  );
}

/** the chart's numbers, which every chart carries: the light-mode hues are not all 3:1 */
function NumbersTable({
  grouped,
  dimension,
  partial,
}: {
  grouped: Grouped;
  dimension: Breakdown;
  partial: Set<string>;
}) {
  const split = grouped.series.length > 1;
  const keys = grouped.series.map((s) => s.key);

  return (
    <Collapsible className="rounded-xl border">
      <CollapsibleTrigger className="group hover:bg-muted/50 flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm font-medium">
        <ChevronRightIcon className="text-muted-foreground size-4 transition-transform group-data-[panel-open]:rotate-90" />
        Show as table
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="overflow-x-auto px-4 pb-3">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th className="py-1.5 text-left font-medium"></th>
                {split &&
                  grouped.series.map((s) => (
                    <th
                      key={s.key}
                      className="px-2 py-1.5 text-right font-medium"
                    >
                      {seriesLabel(s.key, s.label, dimension)}
                    </th>
                  ))}
                <th className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {grouped.categories.map((category) => {
                const row = grouped.values[category.key] ?? {};
                return (
                  <tr key={category.key} className="border-t">
                    <td className="py-1.5">
                      {category.label}
                      {partial.has(category.key) && (
                        <span className="text-muted-foreground">
                          {" "}
                          (partly counted)
                        </span>
                      )}
                    </td>
                    {split &&
                      grouped.series.map((s) => (
                        <td key={s.key} className="px-2 py-1.5 text-right">
                          {row[s.key] ?? ""}
                        </td>
                      ))}
                    <td className="py-1.5 text-right font-medium">
                      {sum(row, keys)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

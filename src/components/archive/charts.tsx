import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRightIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { DataTable } from "~/components/data-table";
import { PanelGroup, SidePanel, useIsPhone } from "~/components/panel";
import { Button } from "~/components/ui/button";
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
  isPeriod,
  periodBounds,
  type Filters,
  type Grouped,
  type Measure,
} from "~/lib/credits/stats";
import { cn } from "~/lib/utils";
import {
  ArchiveShell,
  SheetGroup,
  ToolbarEnd,
  type ViewProps,
} from "./archive-shell";
import { ChartBuilder } from "./chart-builder";
import {
  configOf,
  COUNTS,
  GROUPINGS,
  readChart,
  SPLITS,
  VIEWS,
  writeChart,
  type ChartConfig,
  type ChartState,
  type ViewId,
} from "./chart-config";
import { seriesColor } from "./colors";

export function ChartsPage() {
  return <ArchiveShell>{(props) => <Charts {...props} />}</ArchiveShell>;
}

const TABS: { id: ViewId; label: string }[] = [
  ...VIEWS,
  { id: "custom", label: "Custom" },
];

const UNITS: Record<Measure, [string, string]> = {
  articles: ["article", "articles"],
  contributions: ["contribution", "contributions"],
  people: ["person", "people"],
  newcomers: ["new person", "new people"],
};

const counted = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

const unitOf = (n: number, measure: Measure) => counted(n, ...UNITS[measure]);

/** what the caption says was added up, so a number is never read as the wrong unit */
function unitLine(grouped: Grouped, config: ChartConfig, inView: number) {
  const { measure } = grouped;
  const missing =
    inView > grouped.articles && measure === "contributions"
      ? ` ${counted(inView - grouped.articles, "article has", "articles have")} no credits.`
      : "";
  const total =
    measure === "articles" || measure === "newcomers"
      ? unitOf(grouped.total, measure)
      : `${unitOf(grouped.total, measure)} on ${counted(grouped.articles, "article", "articles")}`;
  if (config.by === "person" && grouped.categories.length < grouped.available)
    return `Top ${grouped.categories.length} of ${counted(grouped.available, "person", "people")}. ${total}.${missing}`;
  return `${total}.${missing}`;
}

function titleOf(config: ChartConfig, measure: Measure) {
  const what = COUNTS.find((c) => c.id === measure)!.label;
  const by = GROUPINGS.find((g) => g.id === config.by)!.label.toLowerCase();
  const split =
    config.split === "none"
      ? ""
      : `, split by ${SPLITS.find((s) => s.id === config.split)!.label.toLowerCase()}`;
  const values =
    config.values === "share"
      ? config.split === "none"
        ? ", as a share of all"
        : ", as a share of each"
      : config.values === "running"
        ? ", as a running total"
        : "";
  return `${what} by ${by}${split}${values}`;
}

/** which periods the chart cannot show whole: still running, or cut by the filter */
function partialKeys(
  grouped: Grouped,
  by: ChartConfig["by"],
  filters: Filters,
) {
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
  /* drawn only once hydrated (ArchiveShell), so the address is there */
  const [state, setState] = useState<ChartState>(() =>
    readChart(window.location.search),
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    writeChart(state, url.searchParams);
    window.history.replaceState(window.history.state, "", url);
  }, [state]);

  const config = configOf(state);
  const [hidden, setHidden] = useState<string[]>([]);
  const [customizing, setCustomizing] = useState(false);
  const phone = useIsPhone();

  const show = (next: ChartState) => {
    setState(next);
    setHidden([]);
  };
  /* changing a saved view makes a custom one from it; the saved one stays */
  const change = (next: ChartConfig) => show({ view: "custom", custom: next });
  /* Custom starts from what was on screen until the builder has made one */
  const choose = (view: ViewId) =>
    show({ view, custom: state.custom ?? config });

  const shown = useMemo(
    () => applyFilters(archive.articles, filters),
    [archive, filters],
  );
  const { grouped, partial } = useMemo(() => {
    const { count, by, split, order, top, values } = configOf(state);
    const grouped = group(shown, {
      measure: count,
      by,
      breakdown: split,
      filters,
      order,
      limit: by === "person" ? top || undefined : undefined,
      running: values === "running",
      history: archive.articles,
    });
    return { grouped, partial: partialKeys(grouped, by, filters) };
  }, [shown, state, filters, archive]);
  const plot = plotOf(grouped, config, hidden, partial);

  const builder = <ChartBuilder config={config} onChange={change} />;
  const tabs = useRef<HTMLDivElement>(null);
  const panelId = useId();

  return (
    <div className="space-y-4">
      {!phone && (
        <ToolbarEnd>
          <Button
            variant="outline"
            aria-expanded={customizing}
            className={cn(customizing && "bg-muted")}
            onClick={() => setCustomizing(!customizing)}
          >
            Customize
          </Button>
        </ToolbarEnd>
      )}
      {!phone && customizing && (
        <SidePanel
          title="Customize"
          back="Charts"
          onClose={() => setCustomizing(false)}
          actions={
            <Button
              variant="ghost"
              disabled={state.view !== "custom"}
              onClick={() => show({ view: VIEWS[0].id, custom: null })}
            >
              Reset
            </Button>
          }
        >
          {builder}
        </SidePanel>
      )}
      {phone && (
        <SheetGroup>
          <PanelGroup label="Chart">{builder}</PanelGroup>
        </SheetGroup>
      )}

      <div
        ref={tabs}
        role="tablist"
        aria-label="Chart views"
        className="flex gap-x-1 overflow-x-auto border-b"
        onKeyDown={(event) => {
          /* the tabs pattern: arrows move between the views, and choose */
          const step =
            event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          event.preventDefault();
          const at = TABS.findIndex((tab) => tab.id === state.view);
          const next = TABS[(at + step + TABS.length) % TABS.length]!;
          choose(next.id);
          tabs.current
            ?.querySelector<HTMLElement>(`[data-view="${next.id}"]`)
            ?.focus();
        }}
      >
        {TABS.map((tab) => {
          const selected = state.view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-view={tab.id}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                choose(tab.id);
                if (tab.id === "custom" && !phone) setCustomizing(true);
              }}
              className={cn(
                /* the chosen view is underlined, so a hovered tab never looks chosen */
                "-mb-px h-10 shrink-0 border-b-2 px-2 text-sm whitespace-nowrap transition-colors sm:px-3",
                selected
                  ? "border-foreground text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <figure id={panelId} role="tabpanel" className="space-y-4">
        <figcaption className="space-y-0.5">
          <div className="font-medium">{titleOf(config, grouped.measure)}</div>
          <div className="text-muted-foreground text-sm">
            {unitLine(grouped, config, shown.length)}
            {partial.size > 0 && (
              <span
                className="ml-2 inline-flex items-center gap-1 align-middle"
                title="Still running, or cut off by the period filter"
              >
                <HatchSwatch />
                Partly counted
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
              plot={plot}
              hidden={hidden}
              onToggle={(key) =>
                setHidden((now) =>
                  now.includes(key)
                    ? now.filter((k) => k !== key)
                    : [...now, key],
                )
              }
            />
            {plot.time ? <TimeChart plot={plot} /> : <BarChart plot={plot} />}
          </>
        )}
      </figure>

      <NumbersTable grouped={grouped} config={config} partial={partial} />
    </div>
  );
}

type Series = { key: string; label: string };

/**
 * Everything a drawing needs, worked out once: which series are on, what each
 * mark's value is, and what a reading of it says.
 */
type Plot = {
  config: ChartConfig;
  grouped: Grouped;
  time: boolean;
  categories: Series[];
  /** the series drawn, in stacking order, without those the legend has off */
  series: Series[];
  /** every series, drawn or not */
  all: Series[];
  partial: Set<string>;
  /** values as percentages */
  share: boolean;
  /** the count behind a mark: as counted, or so far for a running total */
  count: (category: string, series: string) => number;
  /** the category's total, over the series drawn */
  total: (category: string) => number;
  /** what a mark shows: its count, or its share */
  value: (category: string, series: string) => number;
  percent: (category: string, series: string) => number;
  color: (category: string, series: string) => string;
};

const nameOf = (dimension: string, key: string, label: string) =>
  dimension === "role" ? (ROLE_NAMES[key as Role] ?? label) : label;

function plotOf(
  grouped: Grouped,
  config: ChartConfig,
  hidden: string[],
  partial: Set<string>,
): Plot {
  const { split, by } = config;
  const all = grouped.series.map((s) => ({
    key: s.key,
    label:
      split === "none"
        ? COUNTS.find((c) => c.id === grouped.measure)!.label
        : nameOf(split, s.key, s.label),
  }));
  const series = all.filter((s) => !hidden.includes(s.key));
  const allKeys = all.map((s) => s.key);
  const count = (category: string, key: string) =>
    grouped.values[category]?.[key] ?? 0;
  /* people overlap across series, so only their own total is true */
  const additive = grouped.measure !== "people";
  const total = (category: string) =>
    additive
      ? series.reduce((sum, s) => sum + count(category, s.key), 0)
      : (grouped.totals[category] ?? 0);
  const share = config.values === "share";
  /* a split shares out each category; one series shares out everything */
  const percent = (category: string, key: string) => {
    const whole = split === "none" ? grouped.total : total(category);
    return whole ? (count(category, key) / whole) * 100 : 0;
  };
  return {
    config,
    grouped,
    time: isPeriod(by),
    categories: grouped.categories.map((c) => ({
      key: c.key,
      label: nameOf(by, c.key, c.label),
    })),
    series,
    all,
    partial,
    share,
    count,
    total,
    value: share ? percent : count,
    percent,
    /* one series by section or role takes each bar's own colour */
    color: (category, key) =>
      split !== "none"
        ? seriesColor(key, allKeys, split)
        : by === "section" || by === "role"
          ? seriesColor(category, [], by)
          : "var(--series-1)",
  };
}

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
        className="stroke-background"
        strokeWidth="2"
      />
    </svg>
  );
}

function Legend({
  plot,
  hidden,
  onToggle,
}: {
  plot: Plot;
  hidden: string[];
  onToggle: (key: string) => void;
}) {
  /* one series is named by the title */
  if (plot.all.length < 2) return null;
  const lines = plot.config.draw === "lines";
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
      {plot.all.map((series) => {
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
              style={{ background: plot.color("", series.key) }}
            />
            {series.label}
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

const percentText = (value: number) =>
  value > 0 && value < 1 ? "<1%" : `${Math.round(value)}%`;

/** one category in words: what its mark says to a screen reader */
function reading(plot: Plot, category: Series) {
  const total = plot.total(category.key);
  const parts = plot.series.map((s) => {
    const n = plot.count(category.key, s.key);
    return plot.share
      ? `${s.label} ${percentText(plot.percent(category.key, s.key))} (${n.toLocaleString()})`
      : `${s.label} ${n.toLocaleString()}`;
  });
  const partly = plot.partial.has(category.key) ? " (partly counted)" : "";
  const sofar = plot.config.values === "running" ? " so far" : "";
  return `${category.label}${partly}: ${unitOf(total, plot.grouped.measure)}${sofar}${
    plot.series.length > 1 || plot.share ? `. ${parts.join(", ")}` : ""
  }`;
}

/**
 * Which category is being read: the one under the pointer, the one the
 * keyboard is on, or the one tapped or clicked, which stays until another is
 * or something outside the chart is. One tab stop for the chart; arrows move.
 */
function useInspect(count: number, container: RefObject<HTMLElement | null>) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [stop, setStop] = useState(0);

  useEffect(() => {
    if (pinned === null) return;
    const away = (event: globalThis.PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setPinned(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pinned, container]);

  const at = hovered ?? focused ?? pinned;
  const active = at !== null && at < count ? at : null;
  const keyboard = focused !== null && focused < count ? focused : null;

  const mark = (index: number) => ({
    "data-mark": index,
    role: "button",
    tabIndex: index === Math.min(stop, count - 1) ? 0 : -1,
    className: "outline-none",
    onPointerEnter: (event: PointerEvent) => {
      /* a touch has no hover: a tap pins instead */
      if (event.pointerType === "mouse") setHovered(index);
    },
    onClick: () => {
      setStop(index);
      setPinned((now) => (now === index ? null : index));
    },
    onFocus: (event: FocusEvent<SVGElement>) => {
      setStop(index);
      /* a click focuses too; only the keyboard's focus shows the card */
      if (event.currentTarget.matches(":focus-visible")) setFocused(index);
    },
    onBlur: () => setFocused(null),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(null);
        setFocused(null);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setPinned((now) => (now === index ? null : index));
        return;
      }
      const next =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? index + 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? index - 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? count - 1
                : null;
      if (next === null) return;
      event.preventDefault();
      container.current
        ?.querySelector<SVGElement>(
          `[data-mark="${Math.max(0, Math.min(count - 1, next))}"]`,
        )
        ?.focus();
    },
  });

  return { active, keyboard, mark, leave: () => setHovered(null) };
}

const CARD_WIDTH = 216;

/** the card beside a column, or under (or over) a bar */
function Card({
  plot,
  index,
  anchor,
  width,
}: {
  plot: Plot;
  index: number;
  anchor: { left: number; right: number; top: number; bottom: number };
  width: number;
}) {
  const category = plot.categories[index]!;
  const total = plot.total(category.key);
  const side = plot.time;
  const left = side
    ? anchor.right + 8 + CARD_WIDTH <= width
      ? anchor.right + 8
      : Math.max(0, anchor.left - 8 - CARD_WIDTH)
    : Math.min(anchor.left, Math.max(0, width - CARD_WIDTH));
  /* the last rows' card opens upward, so it does not run into the table */
  const above = !side && index > plot.categories.length - 5 && index > 3;
  const many = plot.series.length > 1;

  return (
    <div
      aria-hidden
      className="bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{
        left,
        width: CARD_WIDTH,
        top: side ? anchor.top : above ? anchor.top - 4 : anchor.bottom + 4,
        transform: above ? "translateY(-100%)" : undefined,
      }}
    >
      <div className="mb-1 font-medium">
        {category.label}
        {plot.partial.has(category.key) && (
          <span className="text-muted-foreground font-normal">
            {" "}
            · partly counted
          </span>
        )}
      </div>
      {(many || plot.share) &&
        plot.series.map((s) => {
          const n = plot.count(category.key, s.key);
          return (
            <div
              key={s.key}
              className={cn("flex items-center gap-2", !n && "opacity-50")}
            >
              <span
                aria-hidden
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ background: plot.color(category.key, s.key) }}
              />
              <span className="text-muted-foreground min-w-0 flex-1 truncate">
                {s.label}
              </span>
              <span className="font-semibold tabular-nums">
                {n.toLocaleString()}
              </span>
              {plot.share && (
                <span className="text-muted-foreground w-9 text-right tabular-nums">
                  {percentText(plot.percent(category.key, s.key))}
                </span>
              )}
            </div>
          );
        })}
      {(many || !plot.share) && (
        <div className={cn("flex gap-2", many && "mt-1 border-t pt-1")}>
          <span className="text-muted-foreground flex-1">
            {plot.config.values === "running" ? "Total so far" : "Total"}
          </span>
          <span className="font-semibold tabular-nums">
            {total.toLocaleString()}
          </span>
          {plot.share && <span className="w-9" />}
        </div>
      )}
    </div>
  );
}

/** a clean axis: the smallest round step that keeps it to six intervals or fewer */
function axis(peak: number): { max: number; ticks: number[] } {
  const top = Math.max(peak, 1);
  for (let magnitude = 1; ; magnitude *= 10)
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * magnitude;
      if (!Number.isInteger(step)) continue;
      const max = Math.ceil(top / step) * step;
      if (max / step <= 6) {
        const ticks = [];
        for (let t = 0; t <= max; t += step) ticks.push(t);
        return { max, ticks };
      }
    }
}

/** "Fall 2022" → "F22" when every label must fit */
function shortLabel(label: string) {
  const term = /^(Spring|Fall) (\d{4})$/.exec(label);
  if (term) return `${term[1] === "Spring" ? "Sp" : "F"}${term[2]!.slice(2)}`;
  const month = /^(\w{3}) (\d{4})$/.exec(label);
  if (month) return `${month[1]} ’${month[2]!.slice(2)}`;
  const school = /^\d{2}(\d{2})–(\d{2})$/.exec(label);
  if (school) return `${school[1]}–${school[2]}`;
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

const tickText = (plot: Plot, tick: number) =>
  plot.share ? `${tick}%` : tick.toLocaleString();

/** a full stack of shares is out of 100; anything else is scaled to its biggest mark */
function scaleOf(plot: Plot) {
  const { draw, split } = plot.config;
  const stacked = draw === "stacked";
  if (plot.share && split !== "none" && stacked)
    return { max: 100, ticks: [0, 25, 50, 75, 100] };
  const peak = Math.max(
    0,
    ...plot.categories.map((c) =>
      stacked
        ? plot.series.reduce((sum, s) => sum + plot.value(c.key, s.key), 0)
        : Math.max(0, ...plot.series.map((s) => plot.value(c.key, s.key))),
    ),
  );
  return axis(peak);
}

function TimeChart({ plot }: { plot: Plot }) {
  const { ref, width } = useWidth();
  const hatch = `hatch-${useId().replace(/:/g, "")}`;
  const { categories, series, partial, config } = plot;
  const inspect = useInspect(categories.length, ref);
  const lines = config.draw === "lines";
  const sideBySide = config.draw === "grouped" && series.length > 1;
  const stackedShare =
    plot.share && config.split !== "none" && config.draw === "stacked";
  const { max, ticks } = scaleOf(plot);

  const height = 280 + (stackedShare ? 14 : 0);
  const labelRoom =
    lines && series.length >= 2 && series.length <= 5 && width > 480;
  const longestTick = Math.max(...ticks.map((t) => tickText(plot, t).length));
  const margin = {
    top: 16,
    right: labelRoom ? 104 : 8,
    bottom: stackedShare ? 44 : 30,
    left: longestTick * 7 + 12,
  };
  const plotW = Math.max(100, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const band = plotW / categories.length;
  const barW = Math.min(28, band * 0.68);
  const y = (v: number) => margin.top + plotH - (v / max) * plotH;
  const cx = (index: number) => margin.left + band * index + band / 2;

  /* every label when they fit, short forms when that makes them fit, and only then every nth */
  const longest = Math.max(...categories.map((c) => c.label.length));
  const short = longest * 6.5 > band - 4;
  const shortest = Math.max(
    ...categories.map((c) => shortLabel(c.label).length),
  );
  const every = short ? Math.max(1, Math.ceil((shortest * 6.5 + 6) / band)) : 1;

  /* line-end labels, spread apart so converging lines never stack them */
  const labelY = new Map<string, number>();
  if (labelRoom && categories.length > 0) {
    const lastKey = categories[categories.length - 1]!.key;
    const ends = series
      .map((s) => ({ key: s.key, y: y(plot.value(lastKey, s.key)) }))
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

  const { active, keyboard } = inspect;

  return (
    <div ref={ref} className="relative" onPointerLeave={inspect.leave}>
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={`${titleOf(config, plot.grouped.measure)}. Arrow keys move between periods; the table below has every number.`}
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
              className="stroke-background"
              strokeWidth="1.5"
            />
          </pattern>
        </defs>

        {active !== null && (
          <rect
            x={margin.left + band * active}
            y={margin.top}
            width={band}
            height={plotH}
            className="fill-muted"
            pointerEvents="none"
          />
        )}

        {ticks.map((tick) => (
          <g key={tick} pointerEvents="none">
            {tick > 0 && (
              <line
                x1={margin.left}
                x2={margin.left + plotW}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-border"
                strokeWidth={1}
              />
            )}
            <line
              x1={margin.left - 4}
              x2={margin.left}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-muted-foreground/60"
              strokeWidth={1}
            />
            <text
              x={margin.left - 8}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-xs tabular-nums"
            >
              {tickText(plot, tick)}
            </text>
          </g>
        ))}

        {!lines &&
          categories.map((category, index) => {
            let segments: { key: string; d: string }[];
            if (sideBySide) {
              const w = Math.min(14, (band * 0.8) / series.length);
              const start = cx(index) - (w * series.length) / 2;
              segments = series.flatMap((s, i) => {
                const v = plot.value(category.key, s.key);
                if (v <= 0) return [];
                const top = y(v);
                /* a 2px surface gap between neighbours */
                return [
                  {
                    key: s.key,
                    d: topRounded(
                      start + i * w + 1,
                      top,
                      Math.max(1, w - 2),
                      Math.max(1, y(0) - top),
                      3,
                    ),
                  },
                ];
              });
            } else {
              let base = 0;
              const present = series.filter(
                (s) => plot.value(category.key, s.key) > 0,
              );
              segments = present.map((s, i) => {
                const v = plot.value(category.key, s.key);
                const top = y(base + v);
                const bottom = y(base);
                base += v;
                /* a 2px surface gap between stacked segments */
                const h = Math.max(1, bottom - top - (i > 0 ? 2 : 0));
                const d =
                  i === present.length - 1
                    ? topRounded(cx(index) - barW / 2, top, barW, h, 4)
                    : `M${cx(index) - barW / 2},${top}h${barW}v${h}h${-barW}Z`;
                return { key: s.key, d };
              });
            }
            const total = plot.total(category.key);
            const cap = series.reduce(
              (sum, s) => sum + plot.value(category.key, s.key),
              0,
            );
            return (
              <g key={category.key} pointerEvents="none">
                {segments.map((segment) => (
                  <path
                    key={segment.key}
                    d={segment.d}
                    style={{ fill: plot.color(category.key, segment.key) }}
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
                {!sideBySide && !plot.share && band >= 28 && total > 0 && (
                  <text
                    x={cx(index)}
                    y={y(cap) - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground text-xs tabular-nums"
                  >
                    {total.toLocaleString()}
                  </text>
                )}
              </g>
            );
          })}

        {categories.map((category, index) => (
          <g key={category.key} pointerEvents="none">
            {index % every === 0 && (
              <text
                x={cx(index)}
                y={y(0) + 18}
                textAnchor="middle"
                className={cn(
                  "text-xs",
                  active === index
                    ? "fill-foreground font-medium"
                    : "fill-muted-foreground",
                )}
              >
                {short ? shortLabel(category.label) : category.label}
              </text>
            )}
            {stackedShare && index % every === 0 && (
              <text
                x={cx(index)}
                y={y(0) + 32}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                n={plot.total(category.key)}
              </text>
            )}
          </g>
        ))}

        {lines &&
          series.map((s) => {
            const points = categories.map((c, i) => ({
              key: c.key,
              x: cx(i),
              y: y(plot.value(c.key, s.key)),
            }));
            const end = points[points.length - 1];
            /* the line into a partial period is dashed, so it is not read as a drop */
            return (
              <g
                key={s.key}
                style={{ color: plot.color("", s.key) }}
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
                {points.map((point, i) =>
                  points.length <= 40 || i === active ? (
                    <circle
                      key={point.key}
                      cx={point.x}
                      cy={point.y}
                      r={4}
                      fill={
                        partial.has(point.key)
                          ? "var(--background)"
                          : "currentColor"
                      }
                      stroke={
                        partial.has(point.key)
                          ? "currentColor"
                          : "var(--background)"
                      }
                      strokeWidth={2}
                    />
                  ) : null,
                )}
                {labelRoom && end && (
                  <line
                    x1={end.x + 6}
                    x2={width - margin.right + 16}
                    y1={end.y}
                    y2={labelY.get(s.key) ?? end.y}
                    stroke="currentColor"
                    strokeWidth={1}
                  />
                )}
              </g>
            );
          })}
        {labelRoom &&
          series.map((s) => (
            <text
              key={s.key}
              x={width - margin.right + 20}
              y={labelY.get(s.key)}
              dy="0.32em"
              className="fill-foreground text-xs"
              pointerEvents="none"
            >
              {s.label}
            </text>
          ))}

        <line
          x1={margin.left}
          x2={margin.left + plotW}
          y1={y(0)}
          y2={y(0)}
          className="stroke-muted-foreground"
          strokeWidth={1}
          pointerEvents="none"
        />

        {/* the whole column and its label is the target, drawn last so it is on top */}
        {categories.map((category, index) => (
          <rect
            key={category.key}
            x={margin.left + band * index}
            y={margin.top}
            width={band}
            height={plotH + 24}
            fill="transparent"
            aria-label={reading(plot, category)}
            {...inspect.mark(index)}
          />
        ))}
        {keyboard !== null && (
          <rect
            x={margin.left + band * keyboard + 1}
            y={margin.top + 1}
            width={Math.max(1, band - 2)}
            height={plotH + 22}
            rx={4}
            fill="none"
            className="stroke-ring"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
      </svg>
      {active !== null && (
        <Card
          plot={plot}
          index={active}
          width={width}
          anchor={{
            left: cx(active) - band / 2,
            right: cx(active) + band / 2,
            top: margin.top,
            bottom: margin.top + plotH,
          }}
        />
      )}
    </div>
  );
}

function BarChart({ plot }: { plot: Plot }) {
  const { ref, width } = useWidth();
  const { categories, series, config } = plot;
  const inspect = useInspect(categories.length, ref);
  const sideBySide = config.draw === "grouped" && series.length > 1;
  const { max, ticks } = scaleOf(plot);
  const row = sideBySide ? Math.max(26, series.length * 8 + 12) : 26;
  /* a stack of shares is always 100: the value at its end says nothing */
  const ends = !sideBySide && !(plot.share && config.split !== "none");
  const labelW = Math.min(180, width * 0.36);
  const plotW = Math.max(60, width - labelW - (ends ? 48 : 20));
  const plotH = categories.length * row;
  const height = plotH + 22;
  const x = (v: number) => labelW + (v / max) * plotW;
  const { active, keyboard } = inspect;

  return (
    <div ref={ref} className="relative" onPointerLeave={inspect.leave}>
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={`${titleOf(config, plot.grouped.measure)}. Arrow keys move between rows; the table below has every number.`}
        className="block"
      >
        {active !== null && (
          <rect
            x={0}
            y={active * row}
            width={width}
            height={row}
            rx={4}
            className="fill-muted"
            pointerEvents="none"
          />
        )}
        {ticks.map((tick) => (
          <g key={tick} pointerEvents="none">
            {tick > 0 && (
              <line
                x1={x(tick)}
                x2={x(tick)}
                y1={0}
                y2={plotH}
                className="stroke-border"
                strokeWidth={1}
              />
            )}
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={plotH}
              y2={plotH + 4}
              className="stroke-muted-foreground/60"
              strokeWidth={1}
            />
            <text
              x={x(tick)}
              y={plotH + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-xs tabular-nums"
            >
              {tickText(plot, tick)}
            </text>
          </g>
        ))}
        {categories.map((category, index) => {
          const values = series.map((s) => plot.value(category.key, s.key));
          const sum = values.reduce((a, b) => a + b, 0);
          let marks;
          if (sideBySide) {
            const barH = (row - 10) / series.length;
            marks = series.map((s, i) =>
              values[i]! > 0 ? (
                <path
                  key={s.key}
                  d={rightRounded(
                    labelW,
                    index * row + 5 + i * barH + 1,
                    Math.max(1, x(values[i]!) - labelW),
                    Math.max(1, barH - 2),
                    3,
                  )}
                  style={{ fill: plot.color(category.key, s.key) }}
                />
              ) : null,
            );
          } else {
            const top = index * row + 5;
            const present = series.filter((_, i) => values[i]! > 0);
            let base = 0;
            marks = present.map((s, i) => {
              const v = plot.value(category.key, s.key);
              /* a 2px surface gap between stacked segments */
              const start = x(base) + (i > 0 ? 2 : 0);
              const w = Math.max(1, x(base + v) - x(base) - (i > 0 ? 2 : 0));
              base += v;
              return (
                <path
                  key={s.key}
                  d={
                    i === present.length - 1
                      ? rightRounded(start, top, w, 16, 4)
                      : `M${start},${top}h${w}v16h${-w}Z`
                  }
                  style={{ fill: plot.color(category.key, s.key) }}
                />
              );
            });
          }
          return (
            <g key={category.key} pointerEvents="none">
              <text
                x={labelW - 10}
                y={index * row + row / 2}
                dy="0.32em"
                textAnchor="end"
                className={cn(
                  "fill-foreground text-sm",
                  active === index && "font-medium",
                )}
              >
                {category.label.length > 24
                  ? `${category.label.slice(0, 23)}…`
                  : category.label}
              </text>
              {marks}
              {ends && (
                <text
                  x={x(sum) + 6}
                  y={index * row + row / 2}
                  dy="0.32em"
                  className="fill-muted-foreground text-xs tabular-nums"
                >
                  {plot.share
                    ? percentText(sum)
                    : plot.total(category.key).toLocaleString()}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={labelW}
          x2={labelW}
          y1={0}
          y2={plotH}
          className="stroke-muted-foreground"
          strokeWidth={1}
          pointerEvents="none"
        />
        {categories.map((category, index) => (
          <rect
            key={category.key}
            x={0}
            y={index * row}
            width={width}
            height={row}
            fill="transparent"
            aria-label={reading(plot, category)}
            {...inspect.mark(index)}
          />
        ))}
        {keyboard !== null && (
          <rect
            x={1}
            y={keyboard * row + 1}
            width={Math.max(1, width - 2)}
            height={row - 2}
            rx={4}
            fill="none"
            className="stroke-ring"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
      </svg>
      {active !== null && (
        <Card
          plot={plot}
          index={active}
          width={width}
          anchor={{
            left: labelW,
            right: width,
            top: active * row,
            bottom: (active + 1) * row,
          }}
        />
      )}
    </div>
  );
}

type NumbersRow = {
  key: string;
  label: string;
  partial: boolean;
  counts: Record<string, number>;
  total: number;
};

/** the chart's numbers, which every chart carries: the light-mode hues are not all 3:1 */
function NumbersTable({
  grouped,
  config,
  partial,
}: {
  grouped: Grouped;
  config: ChartConfig;
  partial: Set<string>;
}) {
  /* the full record: every series, whatever the legend has off */
  const plot = plotOf(grouped, config, [], partial);
  const split = plot.all.length > 1;
  const totalLabel = config.values === "running" ? "Total so far" : "Total";

  const number = (value: number, share?: number) => (
    <div className="text-right tabular-nums">
      {value.toLocaleString()}
      {share !== undefined && (
        <span className="text-muted-foreground ml-1.5 inline-block w-9">
          {percentText(share)}
        </span>
      )}
    </div>
  );
  const heading = (label: string) => {
    const Heading = () => <div className="text-right">{label}</div>;
    return Heading;
  };

  const rows: NumbersRow[] = plot.categories.map((c) => ({
    key: c.key,
    label: c.label,
    partial: partial.has(c.key),
    counts: Object.fromEntries(
      plot.all.map((s) => [s.key, plot.count(c.key, s.key)]),
    ),
    total: plot.total(c.key),
  }));

  const columns: ColumnDef<NumbersRow, unknown>[] = [
    {
      id: GROUPINGS.find((g) => g.id === config.by)!.label,
      accessorFn: (row) => row.label,
      enableHiding: false,
      cell: ({ row }) => (
        <>
          {row.original.label}
          {row.original.partial && (
            <span className="text-muted-foreground"> (partly counted)</span>
          )}
        </>
      ),
    },
    ...(split
      ? plot.all.map((s): ColumnDef<NumbersRow, unknown> => ({
          id: s.label,
          accessorFn: (row) => row.counts[s.key] ?? 0,
          header: heading(s.label),
          meta: { csvHeader: s.label },
          cell: ({ row }) =>
            number(
              row.original.counts[s.key] ?? 0,
              plot.share ? plot.percent(row.original.key, s.key) : undefined,
            ),
        }))
      : []),
    {
      id: totalLabel,
      accessorFn: (row) => row.total,
      header: heading(totalLabel),
      meta: { csvHeader: totalLabel },
      cell: ({ row }) =>
        number(
          row.original.total,
          plot.share && !split
            ? plot.percent(row.original.key, plot.all[0]!.key)
            : undefined,
        ),
    },
  ];

  return (
    <Collapsible className="space-y-3">
      <CollapsibleTrigger className="group hover:bg-muted/50 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium">
        <ChevronRightIcon className="text-muted-foreground size-4 transition-transform group-data-[panel-open]:rotate-90" />
        Show as table
      </CollapsibleTrigger>
      <CollapsibleContent>
        <DataTable
          columns={columns}
          data={rows}
          searchable={false}
          csv="chart"
          empty="Nothing matches these filters."
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

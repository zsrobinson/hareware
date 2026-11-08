import {
  ChartPieIcon,
  ChevronRightIcon,
  DownloadIcon,
  HistoryIcon,
  LinkIcon,
  NewspaperIcon,
  SlidersHorizontalIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { CopyTextButton } from "~/components/copy-button";
import { PageActions } from "~/components/page-actions";
import { PanelGroup, SidePanel, useIsPhone } from "~/components/panel";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
import { toCsv } from "~/lib/csv";
import { saveFile } from "~/lib/save-file";
import { cn } from "~/lib/utils";
import {
  AboveToolbar,
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
  rangeOfView,
  readChart,
  SPLITS,
  VIEWS,
  writeChart,
  type ChartConfig,
  type ChartState,
  type ViewId,
} from "./chart-config";
import { seriesColor } from "./colors";

/* the shell's Time filter starts from the view's range, so the view is kept
   here, over the shell, rather than in the chart */
export function ChartsPage() {
  /* the shell draws nothing from it until hydrated, so reading the address
     in the browser's first render does not disagree with the built page */
  const [chart, setChart] = useState<ChartState>(() =>
    readChart(typeof window === "undefined" ? "" : window.location.search),
  );
  return (
    <ArchiveShell defaultPreset={rangeOfView(chart)}>
      {(props) => <Charts {...props} chart={chart} setChart={setChart} />}
    </ArchiveShell>
  );
}

const ICONS: Record<ViewId, LucideIcon> = {
  sections: NewspaperIcon,
  contributors: UsersIcon,
  newcomers: UserPlusIcon,
  mix: ChartPieIcon,
  history: HistoryIcon,
  custom: SlidersHorizontalIcon,
};

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

/**
 * what the caption says was added up, so a number is never read as the wrong
 * unit, and which filters cut it
 */
function unitLine(
  grouped: Grouped,
  config: ChartConfig,
  inView: number,
  filterNote: string,
) {
  const { measure } = grouped;
  const parts: string[] = [];
  if (config.by === "person" && grouped.categories.length < grouped.available)
    parts.push(
      `Top ${grouped.categories.length} of ${counted(grouped.available, "person", "people")}`,
    );
  parts.push(
    measure === "articles" || measure === "newcomers"
      ? unitOf(grouped.total, measure)
      : `${unitOf(grouped.total, measure)} on ${counted(grouped.articles, "article", "articles")}`,
  );
  if (inView > grouped.articles && measure === "contributions")
    parts.push(
      `${counted(inView - grouped.articles, "article has", "articles have")} no credits`,
    );
  if (filterNote) parts.push(filterNote);
  return parts.join(" · ");
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

/** what a period the chart cannot show whole is short of */
type Incomplete = "so far" | "in part";

/** which periods the chart cannot show whole: still running, or cut by the filter */
function partialKeys(
  grouped: Grouped,
  by: ChartConfig["by"],
  filters: Filters,
) {
  const partial = new Map<string, Incomplete>();
  if (!isPeriod(by)) return partial;
  const today = easternDate(new Date().toISOString());
  for (const category of grouped.categories) {
    const { from, to } = periodBounds(category.key, by);
    if (to > today) partial.set(category.key, "so far");
    else if (
      (filters.from && from < filters.from) ||
      (filters.to && to > filters.to)
    )
      partial.set(category.key, "in part");
  }
  return partial;
}

function Charts({
  archive,
  filters,
  filterNote,
  setPreset,
  chart: state,
  setChart: setState,
}: ViewProps & {
  chart: ChartState;
  setChart: (state: ChartState) => void;
}) {
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
  const change = (next: ChartConfig) =>
    show({
      view: "custom",
      custom: next,
      base: state.view === "custom" ? state.base : state.view,
    });
  /* Custom starts from what was on screen until the builder has made one.
     a view brings its own time range; changing Time after is only a filter */
  const choose = (view: ViewId) => {
    if (view === state.view) return;
    const next: ChartState =
      view === "custom" && !state.custom && state.view !== "custom"
        ? { view, custom: config, base: state.view }
        : { ...state, view };
    show(next);
    setPreset(rangeOfView(next));
  };

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
  const panelId = useId();
  /* the address holds the whole chart, which a button says out loud */
  const copyLink = (
    <CopyTextButton
      text={() => window.location.href}
      label="Copy link"
      what="the link to this chart"
      icon={LinkIcon}
      failed="Copy it from the address bar."
    />
  );

  return (
    <div className="space-y-4">
      {/* in the title row, as a table's Download CSV is */}
      <PageActions>
        <span className="contents max-md:hidden">{copyLink}</span>
      </PageActions>
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
              onClick={() =>
                show({ view: state.base, custom: null, base: state.base })
              }
            >
              Reset
            </Button>
          }
        >
          {builder}
        </SidePanel>
      )}
      {phone && (
        <SheetGroup
          onReset={
            state.view === "custom"
              ? () => show({ view: state.base, custom: null, base: state.base })
              : undefined
          }
        >
          <PanelGroup label="Chart">
            {builder}
            <div className="flex flex-wrap gap-2">{copyLink}</div>
          </PanelGroup>
        </SheetGroup>
      )}

      {/* which chart outranks how it is cut, so the views come first */}
      {/* which chart outranks how it is cut, so the views come first */}
      <AboveToolbar>
        <ViewTabs
          view={state.view}
          panelId={panelId}
          onChoose={choose}
          onClickCustom={() => !phone && setCustomizing(true)}
        />
      </AboveToolbar>

      <figure
        id={panelId}
        role="tabpanel"
        data-sheet-anchor
        className="space-y-4"
      >
        <figcaption className="space-y-0.5">
          <div className="font-medium">{titleOf(config, grouped.measure)}</div>
          <div className="text-muted-foreground text-sm">
            {unitLine(grouped, config, shown.length, filterNote)}
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

function ViewTabs({
  view,
  panelId,
  onChoose,
  onClickCustom,
}: {
  view: ViewId;
  panelId: string;
  onChoose: (view: ViewId) => void;
  /** a click on Custom opens the builder; arriving by arrow key does not,
      or the panel would take focus from the tabs */
  onClickCustom: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  /* a phone scrolls the views sideways, and a link may open on one past the edge */
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [view]);

  return (
    <div
      ref={list}
      role="tablist"
      aria-label="Chart views"
      /* a mouse wraps the views onto another row, so none is out of reach
         without a scrollbar; a touch screen swipes them, with no bar under
         them. The rule under each row is a background, not a border: tabs
         pulled over a border made the strip scroll down by a pixel */
      className="flex [scrollbar-width:none] flex-wrap gap-x-1 overflow-x-auto bg-[repeating-linear-gradient(to_bottom,transparent_0_39px,var(--color-border)_39px_40px)] pointer-coarse:flex-nowrap"
      onKeyDown={(event) => {
        /* the tabs pattern: arrows move between the views, and choose */
        const step =
          event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const at = TABS.findIndex((tab) => tab.id === view);
        const next = TABS[(at + step + TABS.length) % TABS.length]!;
        onChoose(next.id);
        list.current
          ?.querySelector<HTMLElement>(`[data-view="${next.id}"]`)
          ?.focus();
      }}
    >
      {TABS.map((tab) => {
        const selected = view === tab.id;
        const Icon = ICONS[tab.id];
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
              onChoose(tab.id);
              if (tab.id === "custom") onClickCustom();
            }}
            className={cn(
              /* the chosen view is underlined, so a hovered tab never looks chosen */
              "flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2 text-sm whitespace-nowrap transition-colors sm:px-3 [&_svg]:size-4 [&_svg]:shrink-0",
              selected
                ? "border-foreground text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            <Icon aria-hidden />
            {tab.label}
          </button>
        );
      })}
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
  partial: Map<string, Incomplete>;
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
  partial: Map<string, Incomplete>,
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

/** "Fall 2026 so far": each period the chart cannot show whole, by name */
const partialNote = (plot: Plot) =>
  plot.categories
    .filter((c) => plot.partial.has(c.key))
    .map((c) => `${c.label} ${plot.partial.get(c.key)}`)
    .join(", ");

function Legend({
  plot,
  hidden,
  onToggle,
}: {
  plot: Plot;
  hidden: string[];
  onToggle: (key: string) => void;
}) {
  const [stop, setStop] = useState(0);
  const toggles = useRef<HTMLDivElement>(null);
  /* one series is named by the title */
  const keyed = plot.all.length > 1;
  if (!keyed && plot.partial.size === 0) return null;
  const lines = plot.config.draw === "lines";
  const at = Math.min(stop, plot.all.length - 1);
  /* a period's marks are faded where it is partial, so its swatch is too */
  const faded = plot.series.slice(0, 3).map((s) => plot.color("", s.key));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {keyed && (
        <div
          ref={toggles}
          role="toolbar"
          aria-label="Series"
          className="flex flex-wrap items-center gap-1"
          onKeyDown={(event) => {
            /* one tab stop for the legend; arrows move along it */
            const last = plot.all.length - 1;
            const next =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? Math.min(last, at + 1)
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? Math.max(0, at - 1)
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? last
                      : null;
            if (next === null) return;
            event.preventDefault();
            setStop(next);
            toggles.current
              ?.querySelector<HTMLElement>(`[data-series="${next}"]`)
              ?.focus();
          }}
        >
          {plot.all.map((series, index) => {
            const off = hidden.includes(series.key);
            return (
              <button
                key={series.key}
                type="button"
                data-series={index}
                tabIndex={index === at ? 0 : -1}
                aria-pressed={!off}
                title={off ? "Show" : "Hide"}
                onFocus={() => setStop(index)}
                onClick={() => onToggle(series.key)}
                className={cn(
                  "hover:bg-muted focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-3",
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
      )}
      {plot.partial.size > 0 && (
        <span
          className={cn(
            "text-muted-foreground flex items-center gap-1.5 px-1.5 py-0.5",
            /* set apart from the series; on a phone it wraps, and a rule would open the line */
            keyed && "sm:border-l sm:pl-3",
          )}
        >
          {lines ? (
            <span
              aria-hidden
              className="w-3.5 border-t-2 border-dashed border-current"
            />
          ) : (
            <span
              aria-hidden
              className="size-3 rounded-sm opacity-45"
              style={{
                background:
                  faded.length > 1
                    ? `linear-gradient(90deg, ${faded.join(", ")})`
                    : faded[0],
              }}
            />
          )}
          {partialNote(plot)}
        </span>
      )}
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
  const partly = plot.partial.has(category.key)
    ? ` (${plot.partial.get(category.key)})`
    : "";
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

type Box = { left: number; right: number; top: number; bottom: number };

/** a number drawn on the chart, as the box its text takes */
const numberBox = (text: string, left: number, middle: number): Box => ({
  left,
  right: left + text.length * 7 + 2,
  top: middle - 9,
  bottom: middle + 9,
});

/**
 * Where the card goes: of `lefts` and `tops`, in order of preference, the
 * place that covers the fewest of the chart's other numbers, so reading one
 * column never hides its neighbours' totals.
 */
function placeCard(
  lefts: number[],
  tops: number[],
  height: number,
  numbers: Box[],
) {
  let best = { left: lefts[0] ?? 0, top: tops[0] ?? 0, covered: Infinity };
  for (const top of tops)
    for (const left of lefts) {
      const covered = numbers.filter(
        (n) =>
          n.left < left + CARD_WIDTH &&
          n.right > left &&
          n.top < top + height &&
          n.bottom > top,
      ).length;
      if (covered < best.covered) best = { left, top, covered };
    }
  return best;
}

/** the card reading one category, put where `place` says once its height is known */
function Card({
  plot,
  index,
  place,
}: {
  plot: Plot;
  index: number;
  place: (height: number) => { left: number; top: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const measure = () => setHeight(card.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const category = plot.categories[index]!;
  const total = plot.total(category.key);
  const many = plot.series.length > 1;
  const { left, top } = place(height);

  return (
    <div
      ref={ref}
      aria-hidden
      className="bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{ left, top, width: CARD_WIDTH }}
    >
      <div className="mb-1 font-medium">
        {category.label}
        {plot.partial.has(category.key) && (
          <span className="text-muted-foreground font-normal">
            {" "}
            {plot.partial.get(category.key)}
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
  /* each column's total on its cap, where there is room for it */
  const totals = !lines && !sideBySide && !plot.share && band >= 28;
  const capOf = (key: string) =>
    series.reduce((sum, s) => sum + plot.value(key, s.key), 0);

  return (
    <div ref={ref} className="relative" onPointerLeave={inspect.leave}>
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={`${titleOf(config, plot.grouped.measure)}. Arrow keys move between periods; the table below has every number.`}
        className="block overflow-visible"
      >
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
            return (
              <g key={category.key} pointerEvents="none">
                {/* faded where the period is not whole, as its legend entry says */}
                {segments.map((segment) => (
                  <path
                    key={segment.key}
                    d={segment.d}
                    fillOpacity={partial.has(category.key) ? 0.45 : undefined}
                    style={{ fill: plot.color(category.key, segment.key) }}
                  />
                ))}
                {totals && total > 0 && (
                  <text
                    x={cx(index)}
                    y={y(capOf(category.key)) - 6}
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
          place={(card) => {
            /* beside the column, clear of the neighbours' totals */
            const right = cx(active) + band / 2 + 8;
            const left = cx(active) - band / 2 - 8 - CARD_WIDTH;
            const lefts = [
              ...(right + CARD_WIDTH <= width ? [right] : []),
              ...(left >= 0 ? [left] : []),
            ];
            const numbers: Box[] = categories.flatMap((c, i) => {
              if (i === active) return [];
              if (lines)
                return series.map((s) => {
                  const at = y(plot.value(c.key, s.key));
                  return {
                    left: cx(i) - 5,
                    right: cx(i) + 5,
                    top: at - 5,
                    bottom: at + 5,
                  };
                });
              const total = plot.total(c.key);
              if (!totals || total <= 0) return [];
              const text = total.toLocaleString();
              return [
                numberBox(
                  text,
                  cx(i) - (text.length * 7 + 2) / 2,
                  y(capOf(c.key)) - 10,
                ),
              ];
            });
            const tops = [
              margin.top,
              ...numbers.flatMap((n) => [n.bottom + 4, n.top - 4 - card]),
            ]
              /* it may run over the axis labels, and a little past the chart,
                 to clear a total; inside the chart first while that clears as many */
              .filter((top) => top >= 0 && top + card <= height + 56)
              .sort(
                (a, b) =>
                  Number(a + card > height) - Number(b + card > height) ||
                  a - b,
              );
            return placeCard(
              lefts.length ? lefts : [Math.max(0, width - CARD_WIDTH)],
              tops.length ? tops : [margin.top],
              card,
              numbers,
            );
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
  const endText = (key: string, sum: number) =>
    plot.share ? percentText(sum) : plot.total(key).toLocaleString();
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
                  {endText(category.key, sum)}
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
          place={(card) => {
            /* under the row (over it near the end), clear of the others' numbers */
            const numbers = ends
              ? categories.flatMap((c, i) => {
                  if (i === active) return [];
                  const sum = series.reduce(
                    (total, s) => total + plot.value(c.key, s.key),
                    0,
                  );
                  return [
                    numberBox(
                      endText(c.key, sum),
                      x(sum) + 6,
                      i * row + row / 2,
                    ),
                  ];
                })
              : [];
            const lefts = [labelW, ...numbers.map((n) => n.right + 8)]
              .filter((left) => left + CARD_WIDTH <= width)
              .sort((a, b) => a - b);
            const below = (active + 1) * row + 4;
            const above = active * row - 4 - card;
            const late = active > categories.length - 5 && active > 3;
            return placeCard(
              lefts.length ? lefts : [Math.max(0, width - CARD_WIDTH)],
              (late ? [above, below] : [below, above]).filter(
                (top) => top >= 0,
              ),
              card,
              numbers,
            );
          }}
        />
      )}
    </div>
  );
}

/** the chart's numbers, which every chart carries: the light-mode hues are not all 3:1 */
function NumbersTable({
  grouped,
  config,
  partial,
}: {
  grouped: Grouped;
  config: ChartConfig;
  partial: Map<string, Incomplete>;
}) {
  const [open, setOpen] = useState(false);
  /* the full record: every series, whatever the legend has off */
  const plot = plotOf(grouped, config, [], partial);
  const split = plot.all.length > 1;
  const totalLabel = config.values === "running" ? "Total so far" : "Total";

  const columns: {
    label: string;
    count: (category: string) => number;
    /** the share shown beside the count, when the chart is of shares */
    share?: (category: string) => number;
  }[] = [
    ...(split
      ? plot.all.map((s) => ({
          label: s.label,
          count: (category: string) => plot.count(category, s.key),
          share: plot.share
            ? (category: string) => plot.percent(category, s.key)
            : undefined,
        }))
      : []),
    {
      label: totalLabel,
      count: plot.total,
      share:
        plot.share && !split
          ? (category: string) => plot.percent(category, plot.all[0]!.key)
          : undefined,
    },
  ];
  const by = GROUPINGS.find((g) => g.id === config.by)!.label;

  function download() {
    const day = new Date().toISOString().slice(0, 10);
    const body = plot.categories.map((c) => [
      c.label,
      ...columns.map((column) => column.count(c.key)),
    ]);
    saveFile(
      /* the BOM makes excel read utf-8 */
      new Blob(["\uFEFF", toCsv([by, ...columns.map((c) => c.label)], body)], {
        type: "text/csv;charset=utf-8",
      }),
      `chart-${day}.csv`,
      "text/csv",
    );
  }

  /* one bordered box: its top row opens it, and the table is inside */
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-lg border"
    >
      <div className="flex items-center gap-2 pr-2">
        <CollapsibleTrigger className="group hover:bg-muted/50 focus-visible:ring-ring/50 flex h-10 flex-1 items-center gap-2 px-3 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-inset">
          <ChevronRightIcon className="text-muted-foreground size-4 transition-transform group-data-[panel-open]:rotate-90" />
          Show as table
        </CollapsibleTrigger>
        {open && (
          <Button variant="ghost" size="sm" onClick={download}>
            <DownloadIcon />
            Download CSV
          </Button>
        )}
      </div>
      <CollapsibleContent className="border-t">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-3">{by}</TableHead>
              {columns.map((column) => (
                <TableHead
                  key={column.label}
                  className="pr-3 text-right last:pr-3"
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {plot.categories.map((category) => (
              <TableRow key={category.key}>
                <TableCell className="pl-3">
                  {category.label}
                  {partial.has(category.key) && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({partial.get(category.key)})
                    </span>
                  )}
                </TableCell>
                {columns.map((column) => (
                  <TableCell
                    key={column.label}
                    className="pr-3 text-right tabular-nums"
                  >
                    {column.count(category.key).toLocaleString()}
                    {column.share && (
                      <span className="text-muted-foreground ml-1.5 inline-block w-9">
                        {percentText(column.share(category.key))}
                      </span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}

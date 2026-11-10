import { ChevronRightIcon, DownloadIcon } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
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
import { useIsPhone } from "~/components/panel";
import { ROLE_NAMES, ROLES, type Role } from "~/lib/credits/labels";
import {
  amountOf,
  applyFilters,
  easternDate,
  isPeriod,
  membersAcross,
  periodBounds,
  type Filters,
  type Grouped,
  type Measure,
  type Member,
} from "~/lib/credits/stats";
import type { ArchiveArticle } from "~/lib/credits/archive";
import type { ViewsSummary } from "~/lib/credits/views";
import { toCsv } from "~/lib/csv";
import { saveFile } from "~/lib/save-file";
import { cn } from "~/lib/utils";
import { useShowsViews, type ViewProps } from "./archive-shell";
import {
  COUNTS,
  GROUPINGS,
  groupOf,
  SPLITS,
  type ChartConfig,
} from "./chart-config";
import {
  chartCount,
  columnSeries,
  measureNote,
  pairCount,
  perArticle,
  perArticleText,
  drawnMembers,
  tooNewText,
  percentText,
  readSlice,
  sliceCount,
  sliceFilters,
  sliceKey,
  sliceMembers,
  unitOf,
  type Slice,
} from "./chart-slice";
import { NEUTRAL, seriesColor } from "./colors";
import {
  againstName,
  compared,
  filtersFor,
  signed,
  spanLabel,
  stateFor,
  type Compared,
} from "./compare";
import { shortLabel } from "./dates";
import { RowDetails, type OpenRow } from "./open-row";
import { SlicePanel } from "./slice-panel";
import { ThinViews, TooNew } from "./views-notes";
import { ShellTableControls } from "./table-controls";
import { ViewHeading } from "./view-heading";

/** what a chart counts, as its one series and its table's column are named */
const measureName = (measure: Measure) =>
  COUNTS.find((c) => c.id === measure)!.label;

/* the chart's title: one series drawn is named in it, as a legend would */
function titleOf(plot: Plot) {
  const { config, grouped, series } = plot;
  const what = measureName(grouped.measure);
  const by = GROUPINGS.find((g) => g.id === config.by)!.label.toLowerCase();
  const one =
    config.split !== "none" && series.length === 1 ? series[0]! : null;
  const split =
    config.split === "none" || one
      ? ""
      : `, split by ${SPLITS.find((s) => s.id === config.split)!.label.toLowerCase()}`;
  const values =
    config.values === "share"
      ? config.split === "none"
        ? ", as a share of all"
        : ", as a share of each"
      : config.values === "running"
        ? ", as a running total"
        : config.values === "per-article"
          ? ", per article"
          : plot.ranges && config.compare !== "none"
            ? `, against ${againstName(config.compare)}`
            : "";
  return one
    ? `${one.label} ${what.toLowerCase()} by ${by}${values}`
    : `${what} by ${by}${split}${values}`;
}

/** what a period the chart cannot show whole is short of */
export type Incomplete = "so far" | "in part";

/** which periods a view cannot show whole: still running, or cut by the filter */
export function partialKeys(
  periods: readonly { key: string }[],
  by: string,
  filters: Filters,
) {
  const partial = new Map<string, Incomplete>();
  if (!isPeriod(by)) return partial;
  const today = easternDate(new Date().toISOString());
  for (const category of periods) {
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

export type ChartViewProps = ViewProps & {
  config: ChartConfig;
  /** the view's own title, or null to say what it shows, and what it answers */
  heading: { title: string | null; question: string | null };
  /** the series the legend has off */
  hidden: string[];
  setHidden: (hidden: string[]) => void;
  /** the slice open beside the chart, kept in the address as `?slice=` */
  opened: OpenRow;
  /** what a phone's Back from a slice says: the view it is on */
  back: string;
};

/** a chart, the numbers it is drawn from, and what any of them counts */
export function ChartView({
  archive,
  filters,
  filterNote,
  filterState,
  config,
  heading,
  hidden,
  setHidden,
  opened,
  back,
}: ChartViewProps) {
  useShowsViews(config.count === "views");
  const shown = useMemo(
    () => applyFilters(archive.articles, filters),
    [archive, filters],
  );
  const { grouped, ranges, note, partial } = useMemo(() => {
    const counting = (articles: ArchiveArticle[], on: Filters, whole = false) =>
      groupOf(
        whole ? { ...config, top: 0 } : config,
        articles,
        on,
        archive.articles,
      );
    const { grouped, ranges, note }: Compared =
      config.compare === "none"
        ? { grouped: counting(shown, filters), ranges: null, note: null }
        : compared(counting, shown, filters, archive.articles, config.compare, {
            by: config.by,
            order: config.order,
            limit: config.by === "person" ? config.top || undefined : undefined,
          });
    return {
      grouped,
      ranges,
      note,
      partial: partialKeys(grouped.categories, config.by, filters),
    };
  }, [shown, config, filters, archive]);
  /* the one section the filters leave, whose colour one series takes */
  const section =
    filters.sections.length === 1 ? filters.sections[0] : undefined;
  const plot = useMemo(
    () => plotOf(grouped, config, hidden, partial, section, ranges),
    [grouped, config, hidden, partial, section, ranges],
  );

  const read = opened.open === null ? null : readSlice(opened.open, grouped);
  /* two ranges have no total: a mark is one of them */
  const slice = ranges && read?.series === null ? null : read;
  /* a link to a mark this chart does not have, or a filter that took it away */
  const missing = opened.open !== null && slice === null;
  useEffect(() => {
    if (missing) opened.close();
  });
  if (config.count === "views" && archive.views.status !== "read")
    return <ViewsUnavailable views={archive.views} />;
  const unseen = noneCounted(
    grouped.measure,
    membersAcross(
      grouped,
      Object.keys(grouped.cells),
      grouped.series.map((s) => s.key),
    ),
  );
  if (unseen !== null)
    return <ViewsUnavailable views={archive.views} articles={unseen} />;
  const openSlice = (next: Slice, from: "chart" | "table") => {
    /* the table has every series, so the chart shows them all to match it */
    const drawn = from === "table" ? [] : hidden;
    /* an empty period has nothing to list */
    if (sliceMembers(grouped, next, drawn).length === 0) return;
    setHidden(drawn);
    opened.show(sliceKey(next));
  };

  return (
    <div className="space-y-4">
      <figure className="space-y-4">
        <ViewHeading
          figure
          title={heading.title ?? titleOf(plot)}
          question={heading.question}
          /* what is drawn, and which filters cut it */
          count={[
            ranges ? pairCount(grouped) : chartCount(grouped, hidden),
            config.values === "per-article" &&
              perArticleText(drawnMembers(grouped, hidden), grouped.measure),
            filterNote,
            measureNote(
              grouped.measure,
              [config.by, config.split],
              drawnMembers(grouped, hidden),
            ),
            tooNewText(drawnMembers(grouped, hidden), grouped.measure),
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          {grouped.measure === "views" && (
            <ThinViews
              articles={drawnMembers(grouped, hidden).map(
                (m) => m.units[0]!.article,
              )}
              summary={archive.views}
            />
          )}
        </ViewHeading>
        {note && (
          <p className="bg-muted/50 rounded-lg border px-3 py-2 text-sm">
            {note}
          </p>
        )}
        {grouped.categories.length === 0 ? (
          <p
            data-sheet-anchor
            className="text-muted-foreground py-12 text-center text-sm"
          >
            Nothing matches these filters.
          </p>
        ) : (
          <>
            <Legend
              plot={plot}
              hidden={hidden}
              onToggle={(key) =>
                setHidden(
                  hidden.includes(key)
                    ? hidden.filter((k) => k !== key)
                    : [...hidden, key],
                )
              }
            />
            {plot.time ? (
              <TimeChart
                plot={plot}
                selected={slice}
                onOpen={(next) => openSlice(next, "chart")}
              />
            ) : (
              <BarChart
                plot={plot}
                selected={slice}
                onOpen={(next) => openSlice(next, "chart")}
              />
            )}
          </>
        )}
      </figure>

      <NumbersTable
        grouped={grouped}
        config={config}
        partial={partial}
        section={section}
        ranges={ranges}
        selected={slice}
        onOpen={(next) => openSlice(next, "table")}
      />

      {slice && (
        <RowDetails>
          <SlicePanel
            views={archive.views}
            key={sliceKey(slice)}
            {...sliceText(plot, slice, filterNote)}
            back={back}
            measure={grouped.measure}
            members={plot.members(slice)}
            filters={filtersFor(filters, ranges, slice.series)}
            seeing={
              ranges
                ? /* a range's bar is its category, on that range's dates */
                  sliceFilters(
                    grouped,
                    { by: config.by, split: "none" },
                    { category: slice.category, series: null },
                    plot.members(slice),
                    [],
                    stateFor(filterState, ranges, slice.series),
                  )
                : sliceFilters(
                    grouped,
                    config,
                    slice,
                    plot.members(slice),
                    hidden,
                    filterState,
                  )
            }
            onClose={opened.close}
            restoreFocus={() =>
              document.querySelector<HTMLElement>(
                `[data-category="${CSS.escape(slice.category)}"]`,
              )
            }
          />
        </RowDetails>
      )}
    </div>
  );
}

/**
 * In place of a count of views when there are none to count: still being
 * read, unreadable, or, for `articles` the filters leave, none of them
 * counted yet. Never drawn as zeros (~/lib/credits/views)
 */
export function ViewsUnavailable({
  views,
  articles,
}: {
  views: ViewsSummary;
  /** how many articles are on screen, none with views read */
  articles?: number;
}) {
  return (
    <p
      data-sheet-anchor
      role="status"
      className="text-muted-foreground py-12 text-center text-sm"
    >
      {articles !== undefined
        ? `None of ${articles === 1 ? "this article's" : `these ${articles} articles'`} views are counted yet: ${
            articles === 1 ? "it is" : "each is"
          } newer than the last read of views.`
        : views.status === "reading"
          ? "Reading views from Jetpack…"
          : `Views are unavailable, so none are counted here.${
              views.status === "unavailable" ? ` ${views.reason}` : ""
            }`}
    </p>
  );
}

/**
 * How many articles a count of views has on screen, when not one of them
 * has views read; null where any has, or it counts something else
 */
export function noneCounted(
  measure: string,
  members: readonly Member[],
): number | null {
  if (measure !== "views" || members.length === 0) return null;
  return amountOf(members, "views").counted === 0 ? members.length : null;
}

/** a slice's title ("News · Fall 2026") and caption: its count, and the filters */
function sliceText(plot: Plot, slice: Slice, filterNote: string) {
  const category = plot.categories.find((c) => c.key === slice.category)!;
  const partly = plot.partial.get(category.key);
  const where = [
    plot.config.values === "running" && "through",
    category.label,
    partly,
  ]
    .filter(Boolean)
    .join(" ");
  /* a column the legend has cut names the series it still has */
  const keys =
    slice.series !== null
      ? [slice.series]
      : plot.columnSeries.length < plot.all.length
        ? plot.columnSeries
        : [];
  const series = plot.all.filter((s) => keys.includes(s.key));
  const title = series.length
    ? `${series.map((s) => s.label).join(", ")} · ${where}`
    : where.charAt(0).toUpperCase() + where.slice(1);
  const whole = plot.share ? plot.whole(slice.category) : undefined;
  return {
    title,
    caption: [
      sliceCount(plot.grouped.measure, plot.members(slice), whole),
      plot.config.values === "per-article" &&
        perArticleText(plot.members(slice), plot.grouped.measure),
      /* the earlier range's dates are in the title, and are not the filters' */
      slice.series !== "then" && filterNote,
      tooNewText(plot.members(slice), plot.grouped.measure),
    ]
      .filter(Boolean)
      .join(" · "),
  };
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
  /** the count behind a mark: as counted, so far for a running total, or
      per article */
  count: (category: string, series: string) => number;
  /** a number as its reading says it: "468 words", "468 words per article" */
  unit: (n: number) => string;
  /** the series a category's total covers (see chart-slice) */
  columnSeries: string[];
  /** the category's total: what its whole column's members come to */
  total: (category: string) => number;
  /** what a share in the category is taken of */
  whole: (category: string) => number;
  /** what a mark, or a whole category, counts */
  members: (slice: Slice) => Member[];
  /** what a mark shows: its count, or its share */
  value: (category: string, series: string) => number;
  /** whether the category has anything to open: articles, even where none
      of their views could be read */
  filled: (category: string) => boolean;
  /** a mark with articles none of whose views could be read: its 0 is no
      answer, so it is said and drawn as unread, never as zero */
  unread: (category: string, series: string | null) => boolean;
  /** a mark's number as text: "–" where it is unread */
  figure: (category: string, series: string | null, n: number) => string;
  percent: (category: string, series: string) => number;
  color: (category: string, series: string) => string;
  /** a line drawn dashed: the second of the roles' grey pair, which is
      too near the first in tone to tell apart at a line's width */
  dashed: (series: string) => boolean;
  /** a mark drawn with an edge: Other, the faintest role, which is too
      near the page in tone to find by its fill alone */
  edged: (category: string, series: string) => boolean;
  /** the two ranges, when each category is the range on screen against an earlier one */
  ranges: Compared["ranges"];
};

const nameOf = (dimension: string, key: string, label: string) =>
  dimension === "role" ? (ROLE_NAMES[key as Role] ?? label) : label;

function plotOf(
  grouped: Grouped,
  config: ChartConfig,
  hidden: string[],
  partial: Map<string, Incomplete>,
  /** the one section the filters leave, if they leave one */
  section: string | undefined,
  ranges: Compared["ranges"] = null,
): Plot {
  const { split, by } = config;
  const all = grouped.series.map((s) => ({
    key: s.key,
    label: ranges
      ? spanLabel(s.key === "then" ? ranges.then : ranges.now)
      : split === "none"
        ? COUNTS.find((c) => c.id === grouped.measure)!.label
        : nameOf(split, s.key, s.label),
  }));
  const series = all.filter((s) => !hidden.includes(s.key));
  const allKeys = all.map((s) => s.key);
  const columns = columnSeries(grouped, hidden);
  const members = (slice: Slice) => sliceMembers(grouped, slice, hidden);
  const unread = (category: string, key: string | null) => {
    if (grouped.measure !== "views") return false;
    const list = members({ category, series: key });
    return list.length > 0 && amountOf(list, grouped.measure).counted === 0;
  };
  /* per article, each number is its list's words or views over the
     articles it counted, so it is still worked out from the list */
  const average = config.values === "per-article";
  const count = average
    ? (category: string, key: string) =>
        grouped.values[category]?.[key] === undefined
          ? 0
          : (perArticle(members({ category, series: key }), grouped.measure) ??
            0)
    : (category: string, key: string) => grouped.values[category]?.[key] ?? 0;
  /* a total is what the list its column opens comes to, worked out once */
  const totals = new Map<string, number>();
  const total = (category: string) => {
    const known = totals.get(category);
    if (known !== undefined) return known;
    const column = members({ category, series: null });
    const n = average
      ? (perArticle(column, grouped.measure) ?? 0)
      : amountOf(column, grouped.measure).value;
    totals.set(category, n);
    return n;
  };
  const share = config.values === "share";
  /* a split shares out each category; one series shares out everything */
  const whole = (category: string) =>
    split === "none" ? grouped.total : total(category);
  const percent = (category: string, key: string) => {
    const of = whole(category);
    return of ? (count(category, key) / of) * 100 : 0;
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
    unit: (n) =>
      `${unitOf(n, grouped.measure)}${average ? " per article" : ""}`,
    columnSeries: columns,
    total,
    whole,
    members,
    value: share ? percent : count,
    filled: (category) =>
      members({ category, series: null }).length > 0 &&
      series.some((s) => members({ category, series: s.key }).length > 0),
    unread,
    figure: (category, key, n) =>
      unread(category, key) ? "–" : n.toLocaleString(),
    percent,
    /* one series by section or role takes each bar's own colour; else the
       section it is cut to, or a grey that names nothing. The earlier of
       two ranges is the same, fainter, and the legend's grey stands for
       every bar's colour */
    color: (category, key) => {
      const own =
        split !== "none"
          ? seriesColor(key, allKeys, split)
          : by === "section" || by === "role"
            ? category
              ? seriesColor(category, [], by)
              : NEUTRAL
            : section
              ? seriesColor(section, [], "section")
              : NEUTRAL;
      return ranges && key === "then"
        ? `color-mix(in oklab, ${own} 40%, transparent)`
        : own;
    },
    dashed: (key) => split === "role" && key === ROLES[1],
    edged: (category, key) =>
      split === "role"
        ? key === ROLES[2]
        : split === "none" && by === "role" && category === ROLES[2],
    ranges,
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
  const lines = plot.config.draw === "lines";
  const at = Math.min(stop, plot.all.length - 1);
  /* a period's marks are faded where it is partial, so its swatch is too */
  const faded = plot.series.slice(0, 3).map((s) => plot.color("", s.key));
  /* said even with one series, which the title names: a pale mark with
     nothing to say why reads as one switched off */
  const partial = plot.partial.size > 0 && (
    <span className="text-muted-foreground flex items-center gap-1.5 px-1.5 py-0.5">
      {lines ? (
        <span
          aria-hidden
          className="w-3.5 border-t-2 border-dotted border-current"
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
  );
  if (plot.all.length <= 1)
    return partial && <div className="flex text-sm">{partial}</div>;

  return (
    /* a gap, not a rule, sets the partial periods apart: a rule is left
       hanging when they wrap */
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
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
              <Swatch
                lines={lines}
                dashed={plot.dashed(series.key)}
                edged={plot.edged("", series.key)}
                color={plot.color("", series.key)}
              />
              {series.label}
            </button>
          );
        })}
      </div>
      {partial}
    </div>
  );
}

/** a series' mark in a legend or a card: a square, or a stroke for lines */
/* Other's edge: the next role's tone, round the mark */
const EDGE = "var(--role-2)";
const edge = (plot: Plot, category: string, series: string) =>
  plot.edged(category, series)
    ? { stroke: EDGE, strokeWidth: 1, "data-edged": "" }
    : {};

function Swatch({
  lines,
  dashed = false,
  edged = false,
  color,
}: {
  lines: boolean;
  dashed?: boolean;
  edged?: boolean;
  color: string;
}) {
  if (lines && dashed)
    return (
      <span
        aria-hidden
        className="w-3.5 shrink-0 border-t-2 border-dashed"
        style={{ borderColor: color }}
      />
    );
  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0",
        lines ? "h-0.5 w-3.5 rounded-full" : "size-3 rounded-sm",
      )}
      style={{
        background: color,
        boxShadow: edged && !lines ? `inset 0 0 0 1px ${EDGE}` : undefined,
      }}
    />
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

/** one category in words: what its mark says to a screen reader */
function reading(plot: Plot, category: Series) {
  const total = plot.total(category.key);
  const parts = plot.series.map((s) => {
    const n = plot.count(category.key, s.key);
    if (plot.unread(category.key, s.key)) return `${s.label} views unavailable`;
    return plot.share
      ? `${s.label} ${percentText(plot.percent(category.key, s.key))} (${n.toLocaleString()})`
      : `${s.label} ${n.toLocaleString()}`;
  });
  const partly = plot.partial.has(category.key)
    ? ` (${plot.partial.get(category.key)})`
    : "";
  const sofar = plot.config.values === "running" ? " so far" : "";
  if (plot.ranges) return `${category.label}: ${parts.join(", ")}`;
  const whole = plot.unread(category.key, null)
    ? "views unavailable"
    : `${plot.unit(total)}${sofar}`;
  return `${category.label}${partly}: ${whole}${
    plot.series.length > 1 || plot.share ? `. ${parts.join(", ")}` : ""
  }`;
}

/** a place in the chart's svg, in its own pixels */
type Point = { x: number; y: number };

const pointIn = (event: PointerEvent | MouseEvent): Point => {
  const box = (
    event.currentTarget as SVGElement
  ).ownerSVGElement!.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
};

/**
 * Which category is being read, and what opening it does. A mouse reads a
 * category by hovering and opens the segment it clicks (or, off the
 * segments, the whole category). A touch has no hover, so a tap pins the
 * card, which stays until another is tapped or something outside the chart
 * is, and the card's own buttons open. The keyboard reads the category it is
 * on and opens all of it with Enter. One tab stop for the chart; arrows move.
 * A category with nothing drawn has nothing to read or open, so it is passed
 * over by all three.
 */
function useInspect(
  count: number,
  container: RefObject<HTMLElement | null>,
  /** the series a point in a category's mark falls on, or null for none */
  hit: (index: number, at: Point) => string | null,
  open: (index: number, series: string | null) => void,
  /** whether a category has anything drawn */
  filled: (index: number) => boolean,
) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [segment, setSegment] = useState<string | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [stop, setStop] = useState(0);
  /* what the click under way began as: a click event cannot say */
  const touch = useRef(false);

  useEffect(() => {
    if (pinned === null) return;
    const away = (event: globalThis.PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setPinned(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pinned, container]);

  const at = hovered ?? focused ?? pinned;
  const active = at !== null && at < count && filled(at) ? at : null;
  const keyboard = focused !== null && focused < count ? focused : null;
  const marks = Array.from({ length: count }, (_, i) => i).filter(filled);
  /* the one tab stop: the last one moved to, or the nearest after it */
  const tabStop = marks.find((i) => i >= stop) ?? marks.at(-1);

  const mark = (index: number) => {
    if (!filled(index))
      return {
        "aria-hidden": true,
        onPointerEnter: () => setHovered(null),
      };
    return {
      "data-mark": index,
      role: "button",
      tabIndex: index === tabStop ? 0 : -1,
      className: "cursor-pointer outline-none",
      onPointerDown: (event: PointerEvent) => {
        touch.current = event.pointerType === "touch";
      },
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType === "mouse") setHovered(index);
      },
      onPointerMove: (event: PointerEvent) => {
        if (event.pointerType === "mouse")
          setSegment(hit(index, pointIn(event)));
      },
      onClick: (event: MouseEvent) => {
        setStop(index);
        if (touch.current) setPinned((now) => (now === index ? null : index));
        else open(index, hit(index, pointIn(event)));
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
          open(index, null);
          return;
        }
        const next =
          event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (marks.find((i) => i > index) ?? index)
            : event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? (marks.findLast((i) => i < index) ?? index)
              : event.key === "Home"
                ? marks[0]
                : event.key === "End"
                  ? marks.at(-1)
                  : null;
        if (next == null) return;
        event.preventDefault();
        container.current
          ?.querySelector<SVGElement>(`[data-mark="${next}"]`)
          ?.focus();
      },
    };
  };

  return {
    active,
    keyboard,
    /** what the mouse would open: a series, null for the whole category, or undefined when no mouse is over the chart */
    segment: hovered !== null ? segment : undefined,
    /** a tapped card, whose rows open what they read */
    tapped: pinned !== null && active === pinned,
    mark,
    leave: () => {
      setHovered(null);
      setSegment(null);
    },
  };
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
  pointing,
  tapped,
  onOpen,
}: {
  plot: Plot;
  index: number;
  place: (height: number) => { left: number; top: number };
  /** what a click would open: a series, or (null) the whole category */
  pointing: string | null | undefined;
  /** tapped, so its rows are what a touch opens */
  tapped: boolean;
  onOpen: (series: string | null) => void;
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
  const row = (on: boolean) =>
    cn(
      "-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 text-left",
      on && "bg-muted",
      tapped && "hover:bg-muted py-1",
    );

  return (
    <div
      ref={ref}
      aria-hidden={!tapped}
      className={cn(
        "bg-popover text-popover-foreground absolute z-10 rounded-lg border px-3 py-2 text-xs shadow-md",
        !tapped && "pointer-events-none",
      )}
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
          /* something to open: articles, even with none of their views read */
          const opens = plot.members({
            category: category.key,
            series: s.key,
          }).length;
          const content = (
            <>
              <Swatch
                lines={plot.config.draw === "lines"}
                dashed={plot.dashed(s.key)}
                edged={plot.edged(category.key, s.key)}
                color={plot.color(category.key, s.key)}
              />
              <span className="text-muted-foreground min-w-0 flex-1 truncate">
                {s.label}
              </span>
              <span className="font-semibold tabular-nums">
                {plot.figure(category.key, s.key, n)}
              </span>
              {plot.share && (
                <span className="text-muted-foreground w-9 text-right tabular-nums">
                  {percentText(plot.percent(category.key, s.key))}
                </span>
              )}
            </>
          );
          /* one series is the whole category, which the button below opens */
          return tapped && many ? (
            <button
              key={s.key}
              type="button"
              disabled={!opens}
              aria-label={`${s.label}: see ${
                plot.unread(category.key, s.key)
                  ? "articles not counted yet"
                  : plot.unit(n)
              }`}
              className={cn(row(false), !opens && "opacity-50")}
              onClick={() => onOpen(s.key)}
            >
              {content}
            </button>
          ) : (
            <div
              key={s.key}
              className={cn(row(pointing === s.key), !opens && "opacity-50")}
            >
              {content}
            </div>
          );
        })}
      {(many || !plot.share) && (
        <div
          className={cn(
            "flex gap-2",
            many && "mt-1 border-t pt-1",
            many && !tapped && row(pointing === null),
          )}
        >
          <span className="text-muted-foreground flex-1">
            {plot.ranges
              ? "Difference"
              : totalName(plot.config, many ? null : plot.grouped.measure)}
          </span>
          <span className="font-semibold tabular-nums">
            {plot.ranges
              ? signed(difference(plot, category.key))
              : plot.figure(category.key, null, total)}
          </span>
          {plot.share && <span className="w-9" />}
        </div>
      )}
      {tapped && !plot.ranges && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          disabled={!plot.filled(category.key)}
          onClick={() => onOpen(null)}
        >
          See{" "}
          {plot.unread(category.key, null)
            ? "the articles not counted yet"
            : plot.unit(total)}
        </Button>
      )}
    </div>
  );
}

/** what a category of two ranges has changed by */
const difference = (plot: Plot, category: string) =>
  plot.count(category, "now") - plot.count(category, "then");

/** a column's total, named by what it counts where there is one series */
const totalName = (config: ChartConfig, single: Measure | null) =>
  `${single ? measureName(single) : "Total"}${config.values === "running" ? " so far" : ""}`;

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

/** a drawn segment, and the box a click on it falls in */
type Segment = {
  key: string;
  d: string;
  box: { x0: number; x1: number; y0: number; y1: number };
};

/** the series of the segment under a point, with a pixel to spare round thin ones */
function segmentAt(segments: Segment[], at: Point): string | null {
  return (
    segments.find(
      ({ box }) =>
        at.x >= box.x0 - 1 &&
        at.x <= box.x1 + 1 &&
        at.y >= box.y0 - 1 &&
        at.y <= box.y1 + 1,
    )?.key ?? null
  );
}

/** what a category's mark opens: one series in it, or (null) all of it */
function sliceAt(plot: Plot, index: number, series: string | null): Slice {
  return {
    category: plot.categories[index]!.key,
    /* with nothing split, the one series is the whole category; of two
       ranges, a category is the one on screen */
    series: plot.ranges
      ? (series ?? "now")
      : plot.config.split === "none"
        ? null
        : series,
  };
}

const selectedIndex = (plot: Plot, selected: Slice | null) => {
  const index = selected
    ? plot.categories.findIndex((c) => c.key === selected.category)
    : -1;
  return index === -1 ? null : index;
};

/** the segment a slice is open on, outlined; fainter, the one a click would open */
function Outline({ d, as }: { d: string; as: "selected" | "pointed" | null }) {
  if (!as) return null;
  return (
    <path
      d={d}
      fill="none"
      className="stroke-foreground"
      strokeOpacity={as === "pointed" ? 0.35 : 1}
      strokeWidth={1.5}
    />
  );
}

/** the same for a line's point */
function Ring({
  x,
  y,
  as,
}: {
  x: number;
  y: number;
  as: "selected" | "pointed" | null;
}) {
  if (!as) return null;
  return (
    <circle
      cx={x}
      cy={y}
      r={7}
      fill="none"
      className="stroke-foreground"
      strokeOpacity={as === "pointed" ? 0.35 : 1}
      strokeWidth={1.5}
    />
  );
}

function TimeChart({
  plot,
  selected,
  onOpen,
}: {
  plot: Plot;
  /** the slice open beside the chart, which its marks show */
  selected: Slice | null;
  onOpen: (slice: Slice) => void;
}) {
  const { ref, width } = useWidth();
  const phone = useIsPhone();
  const { categories, series, partial, config } = plot;
  const lines = config.draw === "lines";
  const sideBySide = config.draw === "grouped" && series.length > 1;
  const stackedShare =
    plot.share && config.split !== "none" && config.draw === "stacked";
  const { max, ticks } = scaleOf(plot);

  const height = 280 + (stackedShare ? 14 : 0);
  /* one period is a point a series, with no line to follow, so each point
     carries its value instead of the line's name at its end */
  const single = lines && categories.length === 1;
  const labelRoom =
    lines && !single && series.length >= 2 && series.length <= 5 && width > 480;
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

  /* labels at the lines' last points: series that end level share one
     ("Writing, Image"), and the rest are spread apart so converging lines
     never stack them */
  const labels: { keys: string[]; text: string; y: number }[] = [];
  if ((labelRoom || single) && categories.length > 0) {
    const lastKey = categories[categories.length - 1]!.key;
    const level = new Map<number, Series[]>();
    for (const s of series) {
      const v = plot.value(lastKey, s.key);
      level.set(v, [...(level.get(v) ?? []), s]);
    }
    const ends = [...level]
      .map(([value, those]) => ({ value, those, y: y(value) }))
      .sort((a, b) => a.y - b.y);
    /* top-down with 14px between them, then lifted if the last one fell below the axis */
    const placed: number[] = [];
    for (const end of ends)
      placed.push(Math.max(end.y, (placed.at(-1) ?? -Infinity) + 14));
    const overflow = Math.max(0, (placed.at(-1) ?? 0) - (margin.top + plotH));
    ends.forEach((end, i) =>
      labels.push({
        keys: end.those.map((s) => s.key),
        text: [
          single &&
            (plot.share
              ? percentText(end.value)
              : plot.figure(lastKey, end.those[0]!.key, end.value)),
          (!single || series.length > 1) &&
            end.those.map((s) => s.label).join(", "),
        ]
          .filter(Boolean)
          .join(" "),
        y: Math.max(margin.top, placed[i]! - overflow),
      }),
    );
  }
  const labelY = new Map(
    labels.flatMap((label) => label.keys.map((key) => [key, label.y])),
  );

  /* each column's segments: where they are drawn, and where a click finds them */
  const columns: Segment[][] = categories.map((category, index) => {
    if (lines) return [];
    if (sideBySide) {
      const w = Math.min(14, (band * 0.8) / series.length);
      const start = cx(index) - (w * series.length) / 2;
      return series.flatMap((s, i) => {
        const v = plot.value(category.key, s.key);
        if (v <= 0) return [];
        const top = y(v);
        const box = { x0: start + i * w, x1: start + (i + 1) * w };
        /* a 2px surface gap between neighbours */
        return [
          {
            key: s.key,
            d: topRounded(
              box.x0 + 1,
              top,
              Math.max(1, w - 2),
              Math.max(1, y(0) - top),
              3,
            ),
            box: { ...box, y0: top, y1: y(0) },
          },
        ];
      });
    }
    let base = 0;
    const present = series.filter((s) => plot.value(category.key, s.key) > 0);
    return present.map((s, i) => {
      const v = plot.value(category.key, s.key);
      const top = y(base + v);
      const bottom = y(base);
      base += v;
      /* a 2px surface gap between stacked segments */
      const h = Math.max(1, bottom - top - (i > 0 ? 2 : 0));
      const left = cx(index) - barW / 2;
      const d =
        i === present.length - 1
          ? topRounded(left, top, barW, h, 4)
          : `M${left},${top}h${barW}v${h}h${-barW}Z`;
      return {
        key: s.key,
        d,
        box: { x0: left, x1: left + barW, y0: top, y1: bottom },
      };
    });
  });

  const inspect = useInspect(
    categories.length,
    ref,
    (index, at) => {
      if (!lines) return segmentAt(columns[index] ?? [], at);
      /* the point nearest the pointer, if it is near */
      const key = categories[index]!.key;
      const near = series
        .map((s) => ({
          key: s.key,
          off: Math.abs(y(plot.value(key, s.key)) - at.y),
        }))
        .sort((a, b) => a.off - b.off)[0];
      return near && near.off <= 10 ? near.key : null;
    },
    (index, at) => onOpen(sliceAt(plot, index, at)),
    (index) => plot.filled(categories[index]!.key),
  );
  const { active, keyboard } = inspect;
  const chosen = selectedIndex(plot, selected);
  /* the segment a slice is open on, and the one the mouse would open */
  const outlined = (key: string, index: number) =>
    chosen === index && selected?.series === key
      ? "selected"
      : active === index && inspect.segment === key
        ? "pointed"
        : null;
  /* each column's total on its cap, where there is room for it */
  const totals = !lines && !sideBySide && !plot.share && band >= 28;
  const capOf = (key: string) =>
    series.reduce((sum, s) => sum + plot.value(key, s.key), 0);

  return (
    <div
      ref={ref}
      data-sheet-anchor
      className="relative"
      onPointerLeave={inspect.leave}
    >
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={`${titleOf(plot)}. Arrow keys move between periods, and Enter lists what a period counts; the table below has every number.`}
        className="block overflow-visible"
      >
        {[...new Set([active, chosen])].map(
          (index) =>
            index !== null && (
              <rect
                key={index}
                x={margin.left + band * index}
                y={margin.top}
                width={band}
                height={plotH}
                className="fill-muted"
                pointerEvents="none"
              />
            ),
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
            const segments = columns[index]!;
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
                    {...edge(plot, category.key, segment.key)}
                  />
                ))}
                {segments.map((segment) => (
                  <Outline
                    key={segment.key}
                    d={segment.d}
                    as={outlined(segment.key, index)}
                  />
                ))}
                {totals && (total > 0 || plot.unread(category.key, null)) && (
                  <text
                    x={cx(index)}
                    y={y(capOf(category.key)) - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground text-xs tabular-nums"
                  >
                    {plot.figure(category.key, null, total)}
                  </text>
                )}
              </g>
            );
          })}

        {categories.map((category, index) => (
          <g key={category.key} pointerEvents="none">
            {(index === categories.length - 1 ||
              (index % every === 0 &&
                categories.length - 1 - index >= every)) && (
              <text
                x={cx(index)}
                y={y(0) + 18}
                textAnchor="middle"
                className={cn(
                  "text-xs",
                  active === index || chosen === index
                    ? "fill-foreground font-medium"
                    : "fill-muted-foreground",
                )}
              >
                {short ? shortLabel(category.label) : category.label}
              </text>
            )}
            {stackedShare &&
              (index === categories.length - 1 ||
                (index % every === 0 &&
                  categories.length - 1 - index >= every)) && (
                <text
                  x={cx(index)}
                  y={y(0) + 32}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {/* what each share is of, in words where there is room */}
                  {band * every >= 72
                    ? plot.unit(plot.total(category.key))
                    : plot.total(category.key).toLocaleString()}
                </text>
              )}
          </g>
        ))}

        {lines &&
          series.map((s) => {
            /* a period none of whose views were read is no point on the
               line, which breaks there rather than dropping to zero */
            const points = categories.map((c, i) => ({
              key: c.key,
              x: cx(i),
              y: y(plot.value(c.key, s.key)),
              gap: plot.unread(c.key, s.key),
            }));
            const end = points[points.length - 1];
            const dashed = plot.dashed(s.key);
            /* the line into a partial period is dotted, so it is not read as
               a drop, nor as the dashed series */
            return (
              <g
                key={s.key}
                style={{ color: plot.color("", s.key) }}
                pointerEvents="none"
              >
                {points
                  .slice(1)
                  .map((point, i) =>
                    point.gap || points[i]!.gap ? null : (
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
                            ? "0 5"
                            : dashed
                              ? "6 5"
                              : undefined
                        }
                      />
                    ),
                  )}
                {points.map((point, i) => (
                  <Ring
                    key={point.key}
                    x={point.x}
                    y={point.y}
                    as={outlined(s.key, i)}
                  />
                ))}
                {points.map((point, i) =>
                  !point.gap && (points.length <= 40 || i === active) ? (
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
        {labels.map((label) => (
          <text
            key={label.keys.join()}
            x={single ? cx(0) + 10 : width - margin.right + 20}
            y={label.y}
            dy="0.32em"
            className="fill-foreground text-xs tabular-nums"
            pointerEvents="none"
          >
            {label.text}
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
            data-category={category.key}
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
          pointing={inspect.segment}
          tapped={inspect.tapped}
          onOpen={(series) => onOpen(sliceAt(plot, active, series))}
          place={(card) => {
            /* over the plot: a phone's card, which is tapped open and stays
               and would hide the columns and their axis, or one with no
               room beside its column */
            const over = {
              left: Math.max(
                0,
                Math.min(width - CARD_WIDTH, cx(active) - CARD_WIDTH / 2),
              ),
              top: -card - 8,
            };
            if (phone) return over;
            /* the highest thing drawn in a column: its total, its tallest
               bar, or its highest point */
            const peak = (key: string) =>
              lines
                ? Math.min(...series.map((s) => y(plot.value(key, s.key)) - 6))
                : sideBySide
                  ? Math.min(...series.map((s) => y(plot.value(key, s.key))))
                  : y(capOf(key)) - (totals && plot.total(key) > 0 ? 18 : 0);
            /* beside the column, the right first, in the room above every
               mark it would cover, so reading one column hides no other.
               A line runs on to the next point, and from this one */
            const slack = lines ? band : 0;
            for (const left of [
              cx(active) + band / 2 + 8,
              cx(active) - band / 2 - 8 - CARD_WIDTH,
            ]) {
              if (left < 0 || left + CARD_WIDTH > width) continue;
              const under = categories.flatMap((c, i) =>
                (i !== active || lines) &&
                cx(i) + band / 2 > left - slack &&
                cx(i) - band / 2 < left + CARD_WIDTH + slack
                  ? [peak(c.key)]
                  : [],
              );
              const top = Math.min(
                margin.top,
                Math.min(y(0), ...under) - 6 - card,
              );
              if (top >= 0) return { left, top };
            }
            return over;
          }}
        />
      )}
    </div>
  );
}

/* the chart's labels are 14px in the page's face, and as wide as a hovered
   one in medium weight; a browser without OffscreenCanvas guesses */
let measure: OffscreenCanvasRenderingContext2D | null | undefined;
function textWidth(text: string) {
  if (measure === undefined) {
    measure =
      typeof OffscreenCanvas === "undefined"
        ? null
        : new OffscreenCanvas(1, 1).getContext("2d");
    if (measure)
      measure.font = `500 14px ${getComputedStyle(document.body).fontFamily}`;
  }
  return measure ? measure.measureText(text).width : text.length * 8;
}

/** a label as it fits in `room` pixels: whole, or cut with an ellipsis */
function fitted(label: string, room: number) {
  if (textWidth(label) <= room) return label;
  for (let n = label.length - 1; n > 0; n--) {
    const cut = `${label.slice(0, n).trimEnd()}…`;
    if (textWidth(cut) <= room) return cut;
  }
  return "…";
}

/** a name in up to two lines of `room`, broken between words, and cut
    only where two lines are not enough */
function wrapped(label: string, room: number): string[] {
  if (textWidth(label) <= room) return [label];
  const words = label.split(" ");
  for (let n = words.length - 1; n > 0; n--) {
    const first = words.slice(0, n).join(" ");
    if (textWidth(first) <= room)
      return [first, fitted(words.slice(n).join(" "), room)];
  }
  return [fitted(label, room)];
}

function BarChart({
  plot,
  selected,
  onOpen,
}: {
  plot: Plot;
  /** the slice open beside the chart, which its marks show */
  selected: Slice | null;
  onOpen: (slice: Slice) => void;
}) {
  const { ref, width } = useWidth();
  const { categories, series, config } = plot;
  const sideBySide = config.draw === "grouped" && series.length > 1;
  const { max, ticks } = scaleOf(plot);
  /* a stack of shares is always 100: the value at its end says nothing */
  const ends = !sideBySide && !(plot.share && config.split !== "none");
  /* names are what a reader looks for: on a phone they take nearly half */
  const labelW = Math.min(180, width * 0.45);
  /* each name in two lines before it is cut, never drawn past the chart's edge */
  const labels = categories.map((c) => wrapped(c.label, labelW - 14));
  const twoLines = labels.some((lines) => lines.length > 1);
  const row = Math.max(
    sideBySide ? series.length * 8 + 12 : 0,
    twoLines ? 38 : 26,
  );
  /* a stacked bar, in the middle of its row */
  const barTop = (row - 16) / 2;
  const plotW = Math.max(60, width - labelW - (ends ? 48 : 20));
  const plotH = categories.length * row;
  const height = plotH + 22;
  const x = (v: number) => labelW + (v / max) * plotW;
  const endText = (key: string, sum: number) =>
    plot.share ? percentText(sum) : plot.figure(key, null, plot.total(key));

  /* each row's segments: where they are drawn, and where a click finds them */
  const rows: Segment[][] = categories.map((category, index) => {
    const values = series.map((s) => plot.value(category.key, s.key));
    if (sideBySide) {
      const barH = (row - 10) / series.length;
      return series.flatMap((s, i) => {
        if (values[i]! <= 0) return [];
        const top = index * row + 5 + i * barH;
        const end = labelW + Math.max(1, x(values[i]!) - labelW);
        return [
          {
            key: s.key,
            d: rightRounded(
              labelW,
              top + 1,
              end - labelW,
              Math.max(1, barH - 2),
              3,
            ),
            box: { x0: labelW, x1: end, y0: top, y1: top + barH },
          },
        ];
      });
    }
    const top = index * row + barTop;
    const present = series.filter((_, i) => values[i]! > 0);
    let base = 0;
    return present.map((s, i) => {
      const v = plot.value(category.key, s.key);
      /* a 2px surface gap between stacked segments */
      const start = x(base) + (i > 0 ? 2 : 0);
      const w = Math.max(1, x(base + v) - x(base) - (i > 0 ? 2 : 0));
      base += v;
      return {
        key: s.key,
        d:
          i === present.length - 1
            ? rightRounded(start, top, w, 16, 4)
            : `M${start},${top}h${w}v16h${-w}Z`,
        box: { x0: start, x1: start + w, y0: top, y1: top + 16 },
      };
    });
  });

  const inspect = useInspect(
    categories.length,
    ref,
    (index, at) => segmentAt(rows[index] ?? [], at),
    (index, at) => onOpen(sliceAt(plot, index, at)),
    (index) => plot.filled(categories[index]!.key),
  );
  const { active, keyboard } = inspect;
  const chosen = selectedIndex(plot, selected);
  const outlined = (key: string, index: number) =>
    chosen === index && selected?.series === key
      ? "selected"
      : active === index && inspect.segment === key
        ? "pointed"
        : null;

  return (
    <div
      ref={ref}
      data-sheet-anchor
      className="relative"
      onPointerLeave={inspect.leave}
    >
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={`${titleOf(plot)}. Arrow keys move between rows, and Enter lists what a row counts; the table below has every number.`}
        className="block"
      >
        {[...new Set([active, chosen])].map(
          (index) =>
            index !== null && (
              <rect
                key={index}
                x={0}
                y={index * row}
                width={width}
                height={row}
                rx={4}
                className="fill-muted"
                pointerEvents="none"
              />
            ),
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
          const sum = series.reduce(
            (total, s) => total + plot.value(category.key, s.key),
            0,
          );
          const segments = rows[index]!;
          return (
            <g key={category.key} pointerEvents="none">
              <text
                y={index * row + row / 2}
                textAnchor="end"
                className={cn(
                  "fill-foreground text-sm",
                  (active === index || chosen === index) && "font-medium",
                )}
              >
                {labels[index]!.map((line, at) => (
                  <tspan
                    key={at}
                    x={labelW - 10}
                    dy={
                      at > 0
                        ? "1.1em"
                        : labels[index]!.length > 1
                          ? "-0.23em"
                          : "0.32em"
                    }
                  >
                    {line}
                  </tspan>
                ))}
                {labels[index]!.join(" ") !== category.label && (
                  <title>{category.label}</title>
                )}
              </text>
              {segments.map((segment) => (
                <path
                  key={segment.key}
                  d={segment.d}
                  style={{ fill: plot.color(category.key, segment.key) }}
                  {...edge(plot, category.key, segment.key)}
                />
              ))}
              {segments.map((segment) => (
                <Outline
                  key={segment.key}
                  d={segment.d}
                  as={outlined(segment.key, index)}
                />
              ))}
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
            data-category={category.key}
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
          pointing={inspect.segment}
          tapped={inspect.tapped}
          onOpen={(series) => onOpen(sliceAt(plot, active, series))}
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
/** a column of the numbers table, and of its CSV */
type NumberColumn = {
  label: string;
  /** what a count in the column opens: one series, or (null) the category */
  series: string | null;
  count: (category: string) => number;
  /** the share shown beside the count, when the chart is of shares */
  share?: (category: string) => number;
  /** a number that is no list, so opens nothing: two ranges' difference */
  text?: (category: string) => string;
};

/* every series, then the category's total or the pair's difference */
function numberColumns(plot: Plot): NumberColumn[] {
  const split = plot.all.length > 1;
  const totalLabel = totalName(
    plot.config,
    split ? null : plot.grouped.measure,
  );
  return [
    ...(split
      ? plot.all.map((s) => ({
          label: s.label,
          series: s.key,
          count: (category: string) => plot.count(category, s.key),
          share: plot.share
            ? (category: string) => plot.percent(category, s.key)
            : undefined,
        }))
      : []),
    plot.ranges
      ? {
          label: "Difference",
          series: null,
          count: (category: string) => difference(plot, category),
          text: (category: string) => signed(difference(plot, category)),
        }
      : {
          label: totalLabel,
          series: null,
          count: plot.total,
          share:
            plot.share && !split
              ? (category: string) => plot.percent(category, plot.all[0]!.key)
              : undefined,
        },
  ];
}

/**
 * The numbers table as rows of text, for a CSV that stands on its own: a
 * per-article chart's headers say so, a count none of whose views could be
 * read is blank, never 0, and a column of views some of whose articles have
 * none read has their counts beside it, so a partial sum or average reads
 * as one
 */
function numbersMatrix(plot: Plot): {
  header: string[];
  body: (string | number)[][];
} {
  const { grouped } = plot;
  const per = plot.config.values === "per-article" ? " per article" : "";
  const by = GROUPINGS.find((g) => g.id === plot.config.by)!.label;
  const header: string[] = [by];
  const cells: ((category: string) => string | number)[] = [];
  for (const column of numberColumns(plot)) {
    if (column.text) {
      header.push(column.label);
      cells.push(column.text);
      continue;
    }
    header.push(`${column.label}${per}`);
    cells.push((category) =>
      plot.unread(category, column.series) ? "" : column.count(category),
    );
    const read = (category: string) =>
      amountOf(
        plot.members({ category, series: column.series }),
        grouped.measure,
      );
    if (plot.categories.some((c) => read(c.key).missing > 0)) {
      header.push(
        `${column.label}: articles counted`,
        `${column.label}: articles too new to count`,
      );
      cells.push(
        (category) => read(category).counted,
        (category) => read(category).missing,
      );
    }
  }
  return {
    header,
    body: plot.categories.map((c) => [
      c.label,
      ...cells.map((cell) => cell(c.key)),
    ]),
  };
}

/** the CSV of a chart's numbers table, every series on */
export const chartMatrix = (
  grouped: Grouped,
  config: ChartConfig,
  ranges: Compared["ranges"] = null,
) => numbersMatrix(plotOf(grouped, config, [], new Map(), undefined, ranges));

function NumbersTable({
  grouped,
  config,
  partial,
  section,
  ranges,
  selected,
  onOpen,
}: {
  grouped: Grouped;
  config: ChartConfig;
  partial: Map<string, Incomplete>;
  section: string | undefined;
  ranges: Compared["ranges"];
  /** the slice open beside the chart */
  selected: Slice | null;
  /** each count opens what it counts, as the chart's marks do */
  onOpen: (slice: Slice) => void;
}) {
  const [open, setOpen] = useState(false);
  /* the full record: every series, whatever the legend has off */
  const plot = useMemo(
    () => plotOf(grouped, config, [], partial, section, ranges),
    [grouped, config, partial, section, ranges],
  );
  const columns = numberColumns(plot);
  const by = GROUPINGS.find((g) => g.id === config.by)!.label;

  function download() {
    const day = new Date().toISOString().slice(0, 10);
    const { header, body } = numbersMatrix(plot);
    saveFile(
      /* the BOM makes excel read utf-8 */
      new Blob(["\uFEFF", toCsv(header, body)], {
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
      {/* in the title row, as every view's is */}
      <ShellTableControls
        columns={null}
        download={
          <Button
            variant="outline"
            className="bg-background"
            onClick={download}
          >
            <DownloadIcon />
            Download CSV
          </Button>
        }
      />
      <CollapsibleTrigger className="group focus-visible:ring-ring/50 flex h-10 w-full items-center gap-2 px-3 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-inset">
        <ChevronRightIcon className="text-muted-foreground group-hover:text-foreground size-4 transition-transform group-data-[panel-open]:rotate-90" />
        {open ? "Hide table" : "Show as table"}
      </CollapsibleTrigger>
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
                    {column.text ? (
                      column.text(category.key)
                    ) : (
                      <CountButton
                        plot={plot}
                        slice={{
                          category: category.key,
                          series: column.series,
                        }}
                        label={column.label}
                        n={column.count(category.key)}
                        selected={selected}
                        onOpen={onOpen}
                      />
                    )}
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

/** a count in the table, which lists what it counts */
function CountButton({
  plot,
  slice,
  label,
  n,
  selected,
  onOpen,
}: {
  plot: Plot;
  slice: Slice;
  label: string;
  n: number;
  selected: Slice | null;
  onOpen: (slice: Slice) => void;
}) {
  const members = plot.members(slice);
  if (members.length === 0)
    return <span className="text-muted-foreground">0</span>;
  /* articles none of whose views could be read: not a zero */
  const { counted, missing } = amountOf(members, plot.grouped.measure);
  const key = sliceKey(slice);
  const category = plot.categories.find((c) => c.key === slice.category)!;
  const open = selected !== null && sliceKey(selected) === key;
  return (
    <button
      type="button"
      data-slice={key}
      aria-label={`${slice.series === null ? category.label : `${label}, ${category.label}`}: see ${plot.unit(n)}`}
      aria-current={open ? "true" : undefined}
      className={cn(
        "focus-visible:ring-ring/50 -mx-1 rounded-sm px-1 tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-3",
        open && "bg-muted font-medium",
      )}
      onClick={() => onOpen(slice)}
    >
      {counted === 0 && missing > 0 ? "–" : n.toLocaleString()}
      <TooNew members={members} measure={plot.grouped.measure} />
    </button>
  );
}

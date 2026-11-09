import { QueryClientProvider } from "@tanstack/react-query";
import {
  CalendarIcon,
  ChevronDownIcon,
  IdCardIcon,
  NewspaperIcon,
  RefreshCwIcon,
  SearchIcon,
  UserRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import type { Archive } from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Role } from "~/lib/credits/labels";
import { peopleOf } from "~/lib/credits/person";
import { sortSections } from "~/lib/credits/sections";
import { searchable, type Filters, type Period } from "~/lib/credits/stats";
import { cn } from "~/lib/utils";
import { FieldRow, FieldRows } from "~/components/field-row";
import { DenialMessage } from "~/components/gated";
import { PageActions } from "~/components/page-actions";
import { BottomSheet, PanelGroup, useIsPhone } from "~/components/panel";
import { couldNotRead, ReadFailed, Reading } from "~/components/read-state";
import { Refused } from "~/lib/gated";
import { Choice } from "./choice";
import { Throttled } from "~/lib/services/wordpress/request";
import { queryClient } from "~/lib/query-client";
import { useHydrated } from "~/lib/use-hydrated";
import { useArchive, useReadProgress, type ArchiveState } from "./archive-data";
import { formatDate, formatDateTime } from "./dates";
import {
  clearedState,
  periodNamed,
  PRESETS,
  readState,
  roundedStart,
  toFilters,
  writeState,
  type FilterState,
  type Preset,
  type Searching,
} from "./filters";
import type { Trail } from "./open-row";
import { useInAddress } from "./page-state";
import { SectionDot } from "./section-name";

/* where a view puts its own controls: the end of the toolbar on a laptop
   (Columns, Customize), and its own group in the phone's Customize sheet */
type Slots = {
  toolbar: HTMLElement | null;
  sheet: HTMLElement | null;
  filters: HTMLElement | null;
  above: HTMLElement | null;
  row: HTMLElement | null;
};
const SlotsContext = createContext<Slots>({
  toolbar: null,
  sheet: null,
  filters: null,
  above: null,
  row: null,
});

/* what the sheet's Reset does besides clearing the filters: each view group's
   own reset, added while the group has something to reset */
type AddReset = (reset: () => void) => () => void;
const ResetContext = createContext<AddReset>(() => () => {});

const TrailContext = createContext<Trail>({
  state: clearedState("all"),
  searching: "articles",
});

/** the filters on screen, for a link to another archive page to take along */
export const useTrail = () => useContext(TrailContext);

/** a view's controls at the end of the toolbar, after a divider (laptop) */
export function ToolbarEnd({ children }: { children: ReactNode }) {
  const { toolbar } = useContext(SlotsContext);
  return toolbar ? createPortal(children, toolbar) : null;
}

/** a page-wide action at the end of a phone's search row, beside Reload */
export function SearchRowEnd({ children }: { children: ReactNode }) {
  const { row } = useContext(SlotsContext);
  return row ? createPortal(children, row) : null;
}

/** what outranks the filters (Charts' views), over the toolbar */
export function AboveToolbar({ children }: { children: ReactNode }) {
  const { above } = useContext(SlotsContext);
  return above ? createPortal(children, above) : null;
}

/** a view's own filter (People's "All people"), among the shell's filters:
    before the divider on a laptop, in the sheet's Filter group on a phone,
    where a `label` gives it a row of its own like the shell's filters */
export function ToolbarFilters({
  children,
  label,
  icon,
}: {
  children: ReactNode;
  /** the row's label in the phone's sheet ("People") */
  label?: string;
  icon?: LucideIcon;
}) {
  const { filters } = useContext(SlotsContext);
  const phone = useIsPhone();
  if (!filters) return null;
  return createPortal(
    phone && label ? (
      <SheetFilter icon={icon} label={label}>
        {children}
      </SheetFilter>
    ) : (
      children
    ),
    filters,
  );
}

/** a view's own group in the phone's Customize sheet, after Filter */
export function SheetGroup({
  children,
  onReset,
}: {
  children: ReactNode;
  /** what the sheet's Reset does to this group; left out while there is
      nothing to reset, which leaves Reset off if the filters are clear too */
  onReset?: () => void;
}) {
  const { sheet } = useContext(SlotsContext);
  const addReset = useContext(ResetContext);
  const latest = useRef(onReset);
  useLayoutEffect(() => {
    latest.current = onReset;
  });
  const resettable = Boolean(onReset);
  useEffect(() => {
    if (!resettable) return;
    return addReset(() => latest.current?.());
  }, [resettable, addReset]);

  return sheet ? createPortal(children, sheet) : null;
}

/* a filter's row in the phone's sheet: the control stays beside its label */
function SheetFilter({
  icon,
  label,
  children,
}: {
  icon?: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <FieldRow
      icon={icon}
      /* the control is named for itself; this only shows it */
      label={<span aria-hidden>{label}</span>}
      inline
      width="panel"
    >
      {children}
    </FieldRow>
  );
}

type Reload = "wordpress" | "sheet";

export type ViewProps = {
  archive: Archive;
  filters: Filters;
  /** rereads WordPress now, for a page where someone just fixed an article */
  refresh: () => void;
  refreshing: boolean;
  /** what the filters narrow to, for a caption ("Last 3 months · Sports");
      empty when nothing is set. A phone hides the filters in a sheet, so the
      caption is where the cut shows */
  filterNote: string;
  /** the filters as set, which choosing a chart view may change */
  filterState: FilterState;
  setFilterState: (state: FilterState) => void;
  /** a phone's Reload, on a page with no filter bar to end: the view puts it
      at the end of its first row. Null where the shell has placed it */
  reloadButton: ReactNode;
};

const SEARCHES: Record<Searching, { placeholder: string; note: string }> = {
  articles: {
    placeholder: "Search titles and bylines",
    note: "in a title or byline",
  },
  people: {
    placeholder: "Search names and bylines",
    note: "in a name or byline",
  },
};

/* "Fall 2025" for a range that is one, else its dates */
function customRange({ from, to }: FilterState): string {
  const named = periodNamed(from, to);
  if (named) return named;
  if (from && to) return `${formatDate(from)} to ${formatDate(to)}`;
  if (from) return `From ${formatDate(from)}`;
  if (to) return `Until ${formatDate(to)}`;
  return "Custom range";
}

/** the filters that are set, in words, for a view's caption */
export function describeFilters(
  state: FilterState,
  period?: Period,
  searching: Searching = "articles",
): string {
  const parts: string[] = [];
  const rounded = roundedStart(state, period);
  /* named even when it is the page's own range, which is not all time and
     would otherwise go unsaid */
  if (state.preset !== "all")
    parts.push(
      state.preset === "custom"
        ? customRange(state)
        : `${PRESETS.find((p) => p.id === state.preset)?.label ?? ""}${
            rounded ? `, from ${rounded.label}` : ""
          }`,
    );
  if (state.sections.length > 0)
    parts.push(
      state.sections.length <= 2
        ? sortSections(state.sections).join(", ")
        : `${state.sections.length} sections`,
    );
  if (state.roles.length > 0)
    parts.push(state.roles.map((role) => ROLE_NAMES[role]).join(", "));
  if (state.people.length > 0)
    parts.push(
      state.people.length <= 2
        ? state.people.join(" and ")
        : `${state.people.length} people`,
    );
  if (state.search.trim())
    parts.push(`“${state.search.trim()}” ${SEARCHES[searching].note}`);
  return parts.filter(Boolean).join(" · ");
}

/** the archive, the filter bar, and whichever view is handed in */
export function ArchiveShell({
  children,
  searching = "articles",
  filters = true,
  roleFilter = true,
  reload = "wordpress",
  /* without a filter bar there is no Time to see, so nothing is cut */
  defaultPreset = filters ? "3m" : "all",
  period,
}: {
  children: (props: ViewProps) => ReactNode;
  searching?: Searching;
  /** false on a page about the Sheet rather than the archive */
  filters?: boolean;
  /** false where a role means nothing, as on Problems */
  roleFilter?: boolean;
  /** what the title row's Reload is named for: on Settings, the Sheet */
  reload?: Reload;
  /** the Time filter a page opens on and Clear goes back to */
  defaultPreset?: Preset;
  /** the period a chart's axis is cut into, which a rolling Time range is
      rounded to (see `roundedStart`) */
  period?: Period;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell
        searching={searching}
        showFilters={filters}
        roleFilter={roleFilter}
        reload={reload}
        defaultPreset={defaultPreset}
        period={period}
      >
        {children}
      </Shell>
    </QueryClientProvider>
  );
}

function Shell({
  children,
  searching,
  showFilters,
  roleFilter,
  reload,
  defaultPreset,
  period,
}: {
  children: (props: ViewProps) => ReactNode;
  searching: Searching;
  showFilters: boolean;
  roleFilter: boolean;
  reload: Reload;
  defaultPreset: Preset;
  period?: Period;
}) {
  const state = useArchive();
  const hydrated = useHydrated();

  if (!hydrated || state.status === "access")
    return <Reading>Opening the archive…</Reading>;
  if (state.status === "reading") return <FirstRead />;
  if (state.status === "refused")
    return <DenialMessage refusal={state.refusal.body} />;
  if (state.status === "failed")
    return (
      <ReadFailed
        message={
          state.error instanceof Throttled
            ? couldNotRead(state.error, "the archive")
            : state.error.message
        }
        onRetry={state.retry}
        retrying={state.retrying}
      />
    );

  return (
    <Ready
      state={state}
      searching={searching}
      showFilters={showFilters}
      roleFilter={roleFilter}
      reload={reload}
      defaultPreset={defaultPreset}
      period={period}
    >
      {children}
    </Ready>
  );
}

function Ready({
  state: { archive, sheetReadAt, checking, checkFailed, refresh: reread },
  children,
  searching,
  showFilters,
  roleFilter,
  reload,
  defaultPreset,
  period,
}: {
  state: Extract<ArchiveState, { status: "ready" }>;
  children: (props: ViewProps) => ReactNode;
  searching: Searching;
  showFilters: boolean;
  roleFilter: boolean;
  reload: Reload;
  defaultPreset: Preset;
  period?: Period;
}) {
  /* asked for by a person, as against a read behind the page: only this one
     dims the page, since only here are they waiting on it */
  const [refreshing, setRefreshing] = useState(false);
  /* a page without the Roles filter counts every role, so a role in its
     link is dropped, from the address too, rather than named in a caption
     it does not cut */
  const supported = useCallback(
    (next: FilterState) => (roleFilter ? next : { ...next, roles: [] }),
    [roleFilter],
  );
  const [state, setRawState] = useInAddress<FilterState>(
    (search) => supported(readState(search, defaultPreset)),
    (value, params) => writeState(value, params, defaultPreset),
  );
  const setState = useCallback(
    (next: FilterState) => setRawState(supported(next)),
    [supported, setRawState],
  );

  const filters = useMemo(() => toFilters(state, period), [state, period]);
  const trail = useMemo(() => ({ state, searching }), [state, searching]);

  /* stable, so a view that listens for something to refresh on (Problems,
     on coming back from WordPress) is not re-subscribed on every render */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reread();
    } catch (error) {
      if (error instanceof Refused) return;
      console.error(error);
      /* what was on screen stays; this says it is not fresher */
      toast.error(
        error instanceof Throttled
          ? "Couldn't refresh: WordPress is busy. Try again in a minute."
          : `Couldn't refresh: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setRefreshing(false);
    }
  }, [reread]);
  const refreshNow = useCallback(() => void refresh(), [refresh]);

  const [slots, setSlots] = useState<Slots>({
    toolbar: null,
    sheet: null,
    filters: null,
    above: null,
    row: null,
  });
  const setRow = useCallback(
    (row: HTMLElement | null) => setSlots((s) => ({ ...s, row })),
    [],
  );
  const setAbove = useCallback(
    (above: HTMLElement | null) => setSlots((s) => ({ ...s, above })),
    [],
  );
  const setToolbar = useCallback(
    (toolbar: HTMLElement | null) => setSlots((s) => ({ ...s, toolbar })),
    [],
  );
  const setFilters = useCallback(
    (filters: HTMLElement | null) => setSlots((s) => ({ ...s, filters })),
    [],
  );
  const setSheet = useCallback(
    (sheet: HTMLElement | null) => setSlots((s) => ({ ...s, sheet })),
    [],
  );

  const [resets, setResets] = useState<ReadonlySet<() => void>>(new Set());
  const addReset = useCallback<AddReset>((reset) => {
    setResets((all) => new Set(all).add(reset));
    return () =>
      setResets((all) => {
        const left = new Set(all);
        left.delete(reset);
        return left;
      });
  }, []);

  const freshness = (compact: boolean) =>
    reload === "sheet" ? (
      /* Reload rereads WordPress with the Sheet, but the Sheet is what
         Settings shows, so its read is the one dated */
      <Freshness
        source="sheet"
        readAt={sheetReadAt}
        checking={refreshing}
        checkFailed={false}
        onRefresh={refreshNow}
        compact={compact}
      />
    ) : (
      <Freshness
        source="wordpress"
        readAt={archive.fetchedAt}
        checking={checking}
        checkFailed={!refreshing && checkFailed !== null}
        onRefresh={refreshNow}
        compact={compact}
      />
    );
  /* a phone keeps the title row for the h1 alone, so the reload sits at the
     end of the search row, where there is one */
  const phone = useIsPhone();
  const inToolbar = phone && showFilters;
  const inView = phone && !showFilters;

  return (
    <SlotsContext.Provider value={slots}>
      <ResetContext.Provider value={addReset}>
        <TrailContext.Provider value={trail}>
          {/* page-wide, so in the title row beside the h1 */}
          {!phone && <PageActions>{freshness(false)}</PageActions>}
          <div className="space-y-6">
            <div ref={setAbove} className="empty:hidden" />
            {showFilters && (
              <FilterBar
                archive={archive}
                state={state}
                setState={setState}
                searchPlaceholder={SEARCHES[searching].placeholder}
                roleFilter={roleFilter}
                defaultPreset={defaultPreset}
                reloadButton={inToolbar && freshness(true)}
                resets={resets}
                toolbarSlot={setToolbar}
                sheetSlot={setSheet}
                filtersSlot={setFilters}
                rowSlot={setRow}
              />
            )}
            {showFilters && (
              <PeopleFilter
                archive={archive}
                state={state}
                setState={setState}
                suggest={searching === "articles"}
              />
            )}
            {showFilters && <SheetNotice archive={archive} />}
            <div
              className={cn("transition-opacity", refreshing && "opacity-60")}
            >
              {children({
                archive,
                filters,
                refresh: refreshNow,
                refreshing,
                filterNote: describeFilters(state, period, searching),
                filterState: state,
                setFilterState: setState,
                reloadButton: inView ? freshness(true) : null,
              })}
            </div>
          </div>
        </TrailContext.Provider>
      </ResetContext.Provider>
    </SlotsContext.Provider>
  );
}

/* the one slow load: a browser that has never read the archive, or not for a
   day. Saying how far it has got, and that it is only this once, keeps a few
   seconds from reading as a hang */
function FirstRead() {
  const { read, total } = useReadProgress();
  return (
    <div className="max-w-sm space-y-2">
      <Reading>
        Reading every published article from WordPress…
        {total > 1 && (
          <span className="tabular-nums">
            {" "}
            {read} of {total}
          </span>
        )}
      </Reading>
      <div className="bg-muted h-1 overflow-hidden rounded-full">
        <div
          className="bg-foreground/60 h-full rounded-full transition-[width] duration-500"
          style={{ width: `${total ? Math.max(8, (read / total) * 100) : 8}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        This takes a few seconds the first time. After that the archive opens at
        once and checks for new articles in the background.
      </p>
    </div>
  );
}

/** "just now", "12 min ago", "3 hr ago", or the date */
function ago(at: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} hr ago`;
  return formatDateTime(at);
}

/* re-renders once a minute, so "12 min ago" does not go stale on screen */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/* how old the articles on screen are, and whether a newer read is coming:
   the stored read is shown at once, so the page has to say when it is old
   and being checked, or a new article missing from it reads as a bug */
const SOURCES: Record<Reload, { name: string; checking: string }> = {
  wordpress: { name: "WordPress", checking: "Checking for new articles…" },
  sheet: { name: "the Sheet", checking: "Reading the Sheet…" },
};

function Freshness({
  source,
  readAt,
  checking,
  checkFailed,
  onRefresh,
  compact,
}: {
  source: Reload;
  readAt: string;
  checking: boolean;
  checkFailed: boolean;
  onRefresh: () => void;
  /** the button alone, the age in its tooltip (a phone's search row) */
  compact: boolean;
}) {
  const now = useNow();
  const { name, checking: checkingText } = SOURCES[source];
  const label = `Reload from ${name}`;
  const status = checking
    ? checkingText
    : checkFailed
      ? `Couldn't check ${name}. As of ${ago(readAt, now)}`
      : `Updated ${ago(readAt, now)}`;
  const warn = checkFailed && "text-amber-700 dark:text-amber-400";

  return (
    /* the last thing in its row lines its icon up with the content's edge */
    <span className="flex items-center gap-1 last:-mr-2">
      <span
        className={cn(
          "text-xs leading-tight",
          warn || "text-muted-foreground",
          compact && "sr-only",
        )}
        role="status"
        title={`Read from ${name} ${formatDateTime(readAt)}`}
      >
        {status}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className={cn(compact && warn)}
        onClick={onRefresh}
        disabled={checking}
        aria-label={label}
        title={compact ? `${status} · ${label}` : label}
      >
        <RefreshCwIcon className={cn(checking && "animate-spin")} />
      </Button>
    </span>
  );
}

const SUGGESTED = 3;

/**
 * The people filter, a chip per person that removes them; and, while the
 * search box holds part of a name, the people it could mean, any of whom
 * counts their own contributions alone in place of the search.
 */
function PeopleFilter({
  archive,
  state,
  setState,
  suggest,
}: {
  archive: Archive;
  state: FilterState;
  setState: (state: FilterState) => void;
  /** false where the search already looks at names (People) */
  suggest: boolean;
}) {
  const typed = suggest ? searchable(state.search.trim()) : "";
  const suggested = useMemo(() => {
    if (typed.length < 2) return [];
    return [...peopleOf(archive.articles).keys()]
      .filter(
        (name) =>
          !state.people.includes(name) && searchable(name).includes(typed),
      )
      .sort((a, b) => a.localeCompare(b))
      .slice(0, SUGGESTED);
  }, [archive, typed, state.people]);

  if (state.people.length === 0 && suggested.length === 0) return null;
  return (
    <div role="group" aria-label="People" className="flex flex-wrap gap-2">
      {state.people.map((name) => (
        <Button
          key={name}
          variant="secondary"
          size="sm"
          title={`Count everyone, not only ${name}`}
          onClick={() =>
            setState({
              ...state,
              people: state.people.filter((p) => p !== name),
            })
          }
        >
          <UserRoundIcon />
          {name}
          <XIcon aria-hidden />
          <span className="sr-only">, remove</span>
        </Button>
      ))}
      {suggested.map((name) => (
        <Button
          key={name}
          variant="outline"
          size="sm"
          className="text-muted-foreground border-dashed"
          title={`Count ${name}'s own contributions, not everyone on articles the search finds`}
          onClick={() =>
            setState({ ...state, people: [...state.people, name], search: "" })
          }
        >
          <UserRoundIcon />
          {state.people.length === 0 ? "Only" : "Also"} {name}
        </Button>
      ))}
    </div>
  );
}

function SheetNotice({ archive }: { archive: Archive }) {
  const { sheet } = archive;
  const message =
    sheet.status === "unconfigured"
      ? "The Sheet isn't connected, so pen names count as their own people."
      : sheet.status === "failed"
        ? `The Sheet couldn't be read, so pen names count as their own people. ${sheet.reason}`
        : archive.sheetProblems.length > 0
          ? `${archive.sheetProblems.length} ${archive.sheetProblems.length === 1 ? "row" : "rows"} in the Sheet couldn't be used. Settings lists them.`
          : null;
  if (!message) return null;

  return (
    <p className="text-muted-foreground border-l-2 border-amber-500/60 pl-3 text-sm">
      {message}
    </p>
  );
}

function FilterBar({
  archive,
  state,
  setState,
  searchPlaceholder,
  roleFilter,
  defaultPreset,
  reloadButton,
  resets,
  toolbarSlot,
  sheetSlot,
  filtersSlot,
  rowSlot,
}: {
  archive: Archive;
  state: FilterState;
  setState: (state: FilterState) => void;
  searchPlaceholder: string;
  roleFilter: boolean;
  defaultPreset: Preset;
  /** a phone's Reload, at the end of the search row */
  reloadButton: ReactNode;
  /** the view groups' own resets, which the sheet's Reset runs */
  resets: ReadonlySet<() => void>;
  /** where the view's own controls go, after the divider */
  toolbarSlot: (element: HTMLElement | null) => void;
  /** where the view's own group goes in the phone's sheet */
  sheetSlot: (element: HTMLElement | null) => void;
  /** where a view's own filter goes, among these */
  filtersSlot: (element: HTMLElement | null) => void;
  /** where a phone's page-wide action goes, beside Reload */
  rowSlot: (element: HTMLElement | null) => void;
}) {
  const phone = useIsPhone();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { ref: searchInput, placeholder } = useFittingPlaceholder(
    searchPlaceholder,
    "Search",
  );
  const clear = clearedState(defaultPreset);
  const changed = JSON.stringify(state) !== JSON.stringify(clear);
  /* what the phone hides in its sheet, counted on the button that opens it */
  const active =
    (state.preset !== defaultPreset ? 1 : 0) +
    (state.sections.length > 0 ? 1 : 0) +
    (state.roles.length > 0 ? 1 : 0);

  const search = (
    /* narrow enough that search, filters and Columns share one line in the
       600px a side panel leaves */
    <label className="relative min-w-0 flex-1 sm:min-w-24 @2xl:min-w-36">
      <span className="sr-only">Search</span>
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        ref={searchInput}
        type="search"
        placeholder={placeholder}
        className="bg-background pl-8"
        value={state.search}
        onChange={(event) => setState({ ...state, search: event.target.value })}
      />
    </label>
  );

  /* in the sheet each control fills its row's control column; on a laptop
     each is as wide as what it says, so the toolbar keeps to one line beside
     a side panel */
  const fill = phone ? "w-full justify-between" : undefined;
  const time = (
    <Choice
      label="Time"
      hideLabel
      width={fill ?? "w-fit"}
      value={state.preset}
      options={PRESETS}
      onChange={(preset) => setState({ ...state, preset })}
    />
  );
  const range = state.preset === "custom" && (
    <span className="flex items-center gap-1.5">
      <DateField
        label="From"
        value={state.from}
        onChange={(from) => setState({ ...state, from })}
      />
      <span className="text-muted-foreground text-sm">to</span>
      <DateField
        label="To"
        value={state.to}
        onChange={(to) => setState({ ...state, to })}
      />
    </span>
  );
  const sections = (
    <MultiSelect
      label="Sections"
      all="All sections"
      className={fill}
      options={archive.sections.map((section) => ({
        value: section,
        label: section,
        icon: <SectionDot section={section} />,
      }))}
      selected={state.sections}
      onChange={(sections) => setState({ ...state, sections })}
    />
  );
  const roles = roleFilter && (
    <MultiSelect
      label="Roles"
      all="All roles"
      className={fill}
      options={ROLES.map((role) => ({
        value: role,
        label: ROLE_NAMES[role],
      }))}
      selected={state.roles}
      onChange={(roles) => setState({ ...state, roles: roles as Role[] })}
    />
  );

  if (phone) {
    /* the search and the people are outside the sheet, so its Reset leaves them */
    const cleared = { ...clear, search: state.search, people: state.people };
    const reset = () => {
      setState(cleared);
      for (const each of resets) each();
    };
    const resettable =
      resets.size > 0 || JSON.stringify(state) !== JSON.stringify(cleared);

    return (
      <section aria-label="Filters" className="flex items-center gap-2">
        {search}
        <Button
          variant="outline"
          aria-expanded={sheetOpen}
          className={cn(sheetOpen && "bg-muted")}
          onClick={() => setSheetOpen((open) => !open)}
        >
          Customize
          {active > 0 && (
            <span className="bg-foreground text-background inline-flex size-4.5 items-center justify-center rounded-full text-[0.6875rem] tabular-nums">
              {active}
              <span className="sr-only">
                {active === 1 ? " filter on" : " filters on"}
              </span>
            </span>
          )}
        </Button>
        {/* before Reload, which lines up with the content's edge as the last */}
        <div ref={rowSlot} className="contents" />
        {reloadButton}
        {sheetOpen && (
          <BottomSheet
            title="Customize"
            onClose={() => setSheetOpen(false)}
            actions={
              <Button variant="ghost" onClick={reset} disabled={!resettable}>
                Reset
              </Button>
            }
          >
            <PanelGroup label="Filter">
              <FieldRows>
                <SheetFilter icon={CalendarIcon} label="Time">
                  {time}
                </SheetFilter>
                {range && (
                  <FieldRow label="Range" width="panel">
                    {range}
                  </FieldRow>
                )}
                <SheetFilter icon={NewspaperIcon} label="Sections">
                  {sections}
                </SheetFilter>
                {roles && (
                  <SheetFilter icon={IdCardIcon} label="Roles">
                    {roles}
                  </SheetFilter>
                )}
                <div ref={filtersSlot} className="contents" />
              </FieldRows>
            </PanelGroup>
            {/* the view's own group (Chart, Table) */}
            <div ref={sheetSlot} className="contents" />
          </BottomSheet>
        )}
      </section>
    );
  }

  return (
    /* a container, so its controls can shorten beside a side panel and the
     toolbar stays one line */
    <div className="@container">
      <section
        aria-label="Filters"
        className="flex flex-wrap items-center gap-2 @max-2xl:gap-1"
      >
        {search}
        {time}
        {range}
        {sections}
        {roles}
        <div ref={filtersSlot} className="contents" />
        {/* last of the filters, since it clears them all; beside a panel,
            its icon alone, as Columns is */}
        {changed && (
          <Button
            variant="ghost"
            className="@max-2xl:px-2"
            title="Clear filters"
            onClick={() => setState(clear)}
          >
            <XIcon />
            <span className="@max-2xl:sr-only">Clear</span>
          </Button>
        )}
        {/* the view's own controls, set apart from the filters */}
        <div
          ref={toolbarSlot}
          className="flex items-center gap-2 border-l pl-2 empty:hidden @max-2xl:pl-1.5"
        />
      </section>
    </div>
  );
}

/**
 * The placeholder while all of it shows, else the short one, else none (the
 * icon and the field's name still say what it is): an input cuts its
 * placeholder off wherever the box ends, mid-word.
 */
function useFittingPlaceholder(full: string, short: string) {
  const ref = useRef<HTMLInputElement>(null);
  const [placeholder, setPlaceholder] = useState(full);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    let context: CanvasRenderingContext2D | null = null;
    const check = () => {
      /* nothing laid out (a test's document) has nothing to measure */
      if (!input.clientWidth) return;
      context ??= document.createElement("canvas").getContext("2d");
      if (!context) return;
      const style = getComputedStyle(input);
      context.font = style.font;
      /* less the room a search field keeps for its clear button */
      const room =
        input.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        20;
      const measure = context;
      setPlaceholder(
        [full, short].find((text) => measure.measureText(text).width <= room) ??
          "",
      );
    };
    check();
    /* measured in the fallback font, it would fit text the real one does not */
    void document.fonts?.ready.then(check);
    const observer = new ResizeObserver(check);
    observer.observe(input);
    return () => observer.disconnect();
  }, [full, short]);
  return { ref, placeholder };
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="date"
      aria-label={label}
      className="bg-background w-auto"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** a dropdown of checkboxes; none checked means all */
function MultiSelect({
  label,
  all,
  options,
  selected,
  onChange,
  className,
}: {
  label: string;
  all: string;
  options: { value: string; label: string; icon?: ReactNode }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}) {
  const summary =
    selected.length === 0
      ? all
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label
        : `${selected.length} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        render={
          <Button
            variant="outline"
            className={cn(
              "bg-background font-normal",
              selected.length > 0 && "border-foreground/40",
              className,
            )}
          />
        }
      >
        {summary}
        <ChevronDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={(on) =>
              onChange(
                on
                  ? [...selected, option.value]
                  : selected.filter((v) => v !== option.value),
              )
            }
          >
            {option.icon}
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange([])}>
              {all}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { QueryClientProvider } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { sortSections } from "~/lib/credits/sections";
import type { Filters } from "~/lib/credits/stats";
import { cn } from "~/lib/utils";
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
import { formatDateTime } from "./dates";
import {
  DEFAULT_STATE,
  PRESETS,
  readState,
  toFilters,
  writeState,
  type FilterState,
} from "./filters";

/* where a view puts its own controls: the end of the toolbar on a laptop
   (Columns, Customize), and its own group in the phone's Customize sheet */
type Slots = { toolbar: HTMLElement | null; sheet: HTMLElement | null };
const SlotsContext = createContext<Slots>({ toolbar: null, sheet: null });

/** a view's controls at the end of the toolbar, after a divider (laptop) */
export function ToolbarEnd({ children }: { children: ReactNode }) {
  const { toolbar } = useContext(SlotsContext);
  return toolbar ? createPortal(children, toolbar) : null;
}

/** a view's own group in the phone's Customize sheet, after Filter */
export function SheetGroup({ children }: { children: ReactNode }) {
  const { sheet } = useContext(SlotsContext);
  return sheet ? createPortal(children, sheet) : null;
}

type Reload = "wordpress" | "sheet";

export type ViewProps = {
  archive: Archive;
  filters: Filters;
  /** rereads WordPress now, for a page where someone just fixed an article */
  refresh: () => void;
  refreshing: boolean;
  /** what the filters narrow to, for a caption ("Sports · Writing"); empty
      when nothing is set. A phone hides the filters in a sheet, so the
      caption is where the cut shows */
  filterNote: string;
};

/** the filters that are set, in words, for a view's caption */
export function describeFilters(state: FilterState): string {
  const parts: string[] = [];
  if (state.preset !== DEFAULT_STATE.preset)
    parts.push(
      state.preset === "custom"
        ? [state.from, state.to].filter(Boolean).join(" to ") || "Custom range"
        : (PRESETS.find((p) => p.id === state.preset)?.label ?? ""),
    );
  if (state.sections.length > 0)
    parts.push(
      state.sections.length <= 2
        ? sortSections(state.sections).join(", ")
        : `${state.sections.length} sections`,
    );
  if (state.roles.length > 0)
    parts.push(state.roles.map((role) => ROLE_NAMES[role]).join(", "));
  return parts.filter(Boolean).join(" · ");
}

/** the archive, the filter bar, and whichever view is handed in */
export function ArchiveShell({
  children,
  searchPlaceholder = "Search titles and names",
  filters = true,
  roleFilter = true,
  reload = "wordpress",
}: {
  children: (props: ViewProps) => ReactNode;
  searchPlaceholder?: string;
  /** false on a page about the Sheet rather than the archive */
  filters?: boolean;
  /** false where a role means nothing, as on Problems */
  roleFilter?: boolean;
  /** what the title row's Reload is named for: on Settings, the Sheet */
  reload?: Reload;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell
        searchPlaceholder={searchPlaceholder}
        showFilters={filters}
        roleFilter={roleFilter}
        reload={reload}
      >
        {children}
      </Shell>
    </QueryClientProvider>
  );
}

function Shell({
  children,
  searchPlaceholder,
  showFilters,
  roleFilter,
  reload,
}: {
  children: (props: ViewProps) => ReactNode;
  searchPlaceholder: string;
  showFilters: boolean;
  roleFilter: boolean;
  reload: Reload;
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
      searchPlaceholder={searchPlaceholder}
      showFilters={showFilters}
      roleFilter={roleFilter}
      reload={reload}
    >
      {children}
    </Ready>
  );
}

function Ready({
  state: { archive, checking, checkFailed, refresh: reread },
  children,
  searchPlaceholder,
  showFilters,
  roleFilter,
  reload,
}: {
  state: Extract<ArchiveState, { status: "ready" }>;
  children: (props: ViewProps) => ReactNode;
  searchPlaceholder: string;
  showFilters: boolean;
  roleFilter: boolean;
  reload: Reload;
}) {
  /* asked for by a person, as against a read behind the page: only this one
     dims the page, since only here are they waiting on it */
  const [refreshing, setRefreshing] = useState(false);
  /* drawn only once hydrated (Shell), so the address is there */
  const [state, setState] = useState<FilterState>(() =>
    readState(window.location.search),
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    writeState(state, url.searchParams);
    window.history.replaceState(window.history.state, "", url);
  }, [state]);

  const filters = useMemo(() => toFilters(state), [state]);

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

  const [slots, setSlots] = useState<Slots>({ toolbar: null, sheet: null });
  const setToolbar = useCallback(
    (toolbar: HTMLElement | null) => setSlots((s) => ({ ...s, toolbar })),
    [],
  );
  const setSheet = useCallback(
    (sheet: HTMLElement | null) => setSlots((s) => ({ ...s, sheet })),
    [],
  );

  return (
    <SlotsContext.Provider value={slots}>
      {/* page-wide, so in the title row beside the h1 */}
      <PageActions>
        {reload === "sheet" ? (
          /* the Sheet is read afresh on every visit, so it has no age to
             give; Reload rereads WordPress with it */
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={refreshNow}
            disabled={refreshing}
          >
            <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
            Reload from the Sheet
          </Button>
        ) : (
          <Freshness
            fetchedAt={archive.fetchedAt}
            checking={checking}
            checkFailed={!refreshing && checkFailed !== null}
            onRefresh={refreshNow}
          />
        )}
      </PageActions>
      <div className="space-y-6">
        {showFilters && (
          <FilterBar
            archive={archive}
            state={state}
            setState={setState}
            searchPlaceholder={searchPlaceholder}
            roleFilter={roleFilter}
            toolbarSlot={setToolbar}
            sheetSlot={setSheet}
          />
        )}
        {showFilters && <SheetNotice archive={archive} />}
        <div className={cn("transition-opacity", refreshing && "opacity-60")}>
          {children({
            archive,
            filters,
            refresh: refreshNow,
            refreshing,
            filterNote: describeFilters(state),
          })}
        </div>
      </div>
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
function Freshness({
  fetchedAt,
  checking,
  checkFailed,
  onRefresh,
}: {
  fetchedAt: string;
  checking: boolean;
  checkFailed: boolean;
  onRefresh: () => void;
}) {
  const now = useNow();
  return (
    <span className="flex items-center gap-1">
      <span
        className={cn(
          "text-xs leading-tight",
          checkFailed
            ? "text-amber-700 dark:text-amber-400"
            : "text-muted-foreground",
        )}
        role="status"
        title={`Read from WordPress ${formatDateTime(fetchedAt)}`}
      >
        {checking
          ? "Checking for new articles…"
          : checkFailed
            ? `Couldn't check WordPress. As of ${ago(fetchedAt, now)}`
            : `Updated ${ago(fetchedAt, now)}`}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRefresh}
        disabled={checking}
        aria-label="Reload from WordPress"
        title="Reload from WordPress"
      >
        <RefreshCwIcon className={cn(checking && "animate-spin")} />
      </Button>
    </span>
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
  toolbarSlot,
  sheetSlot,
}: {
  archive: Archive;
  state: FilterState;
  setState: (state: FilterState) => void;
  searchPlaceholder: string;
  roleFilter: boolean;
  /** where the view's own controls go, after the divider */
  toolbarSlot: (element: HTMLElement | null) => void;
  /** where the view's own group goes in the phone's sheet */
  sheetSlot: (element: HTMLElement | null) => void;
}) {
  const phone = useIsPhone();
  const [sheetOpen, setSheetOpen] = useState(false);
  const changed = JSON.stringify(state) !== JSON.stringify(DEFAULT_STATE);
  /* what the phone hides in its sheet, counted on the button that opens it */
  const active =
    (state.preset !== DEFAULT_STATE.preset ? 1 : 0) +
    (state.sections.length > 0 ? 1 : 0) +
    (state.roles.length > 0 ? 1 : 0);

  const search = (
    <label className="relative min-w-0 flex-1 sm:min-w-56">
      <span className="sr-only">Search</span>
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        type="search"
        placeholder={searchPlaceholder}
        className="bg-background pl-8"
        value={state.search}
        onChange={(event) => setState({ ...state, search: event.target.value })}
      />
    </label>
  );

  const choices = (
    <>
      <Choice
        label="Period"
        hideLabel
        width="w-40"
        value={state.preset}
        options={PRESETS}
        onChange={(preset) => setState({ ...state, preset })}
      />

      {state.preset === "custom" && (
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
      )}

      <MultiSelect
        label="Sections"
        all="All sections"
        options={archive.sections.map((section) => ({
          value: section,
          label: section,
        }))}
        selected={state.sections}
        onChange={(sections) => setState({ ...state, sections })}
      />
      {roleFilter && (
        <MultiSelect
          label="Roles"
          all="All roles"
          options={ROLES.map((role) => ({
            value: role,
            label: ROLE_NAMES[role],
          }))}
          selected={state.roles}
          onChange={(roles) => setState({ ...state, roles: roles as Role[] })}
        />
      )}
      {changed && (
        <Button variant="ghost" onClick={() => setState(DEFAULT_STATE)}>
          <XIcon /> Clear
        </Button>
      )}
    </>
  );

  if (phone)
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
              <span className="sr-only"> filters on</span>
            </span>
          )}
        </Button>
        {sheetOpen && (
          <BottomSheet title="Customize" onClose={() => setSheetOpen(false)}>
            <PanelGroup label="Filter">
              <div className="flex flex-wrap gap-2">{choices}</div>
            </PanelGroup>
            {/* the view's own group (Chart, Table) */}
            <div ref={sheetSlot} className="contents" />
          </BottomSheet>
        )}
      </section>
    );

  return (
    <section aria-label="Filters" className="flex flex-wrap items-center gap-2">
      {search}
      {choices}
      {/* the view's own controls, set apart from the filters */}
      <div
        ref={toolbarSlot}
        className="flex items-center gap-2 border-l pl-2 empty:hidden"
      />
    </section>
  );
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
}: {
  label: string;
  all: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
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
            )}
          />
        }
      >
        {summary}
        <ChevronDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
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

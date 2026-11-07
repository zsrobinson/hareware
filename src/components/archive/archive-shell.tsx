import { QueryClientProvider } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { Filters } from "~/lib/credits/stats";
import { cn } from "~/lib/utils";
import { DenialMessage, Refused } from "~/components/gated";
import { Choice } from "./choice";
import { Throttled } from "~/lib/services/wordpress/request";
import { queryClient } from "~/lib/query-client";
import { useHydrated } from "~/components/queries";
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

export type ViewProps = {
  archive: Archive;
  filters: Filters;
  /** rereads WordPress now, for a page where someone just fixed an article */
  refresh: () => void;
  refreshing: boolean;
};

/** the archive, the filter bar, and whichever view is handed in */
export function ArchiveShell({
  children,
  searchPlaceholder = "Search titles and names",
  filters = true,
  roleFilter = true,
}: {
  children: (props: ViewProps) => ReactNode;
  searchPlaceholder?: string;
  /** false on a page about the Sheet rather than the archive */
  filters?: boolean;
  /** false where a role means nothing, as on Problems */
  roleFilter?: boolean;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell
        searchPlaceholder={searchPlaceholder}
        showFilters={filters}
        roleFilter={roleFilter}
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
}: {
  children: (props: ViewProps) => ReactNode;
  searchPlaceholder: string;
  showFilters: boolean;
  roleFilter: boolean;
}) {
  const state = useArchive();
  /* the build drew "Opening the archive…"; an archive already in memory, as
     after moving between pages, is drawn just after hydration rather than in
     it, so the two agree */
  const hydrated = useHydrated();

  if (!hydrated || state.status === "access")
    return <Waiting>Opening the archive…</Waiting>;
  if (state.status === "reading") return <FirstRead />;
  if (state.status === "refused")
    return <DenialMessage refusal={state.refusal.body} />;
  if (state.status === "failed")
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">
          {state.error instanceof Throttled
            ? "WordPress is busy right now, so the archive couldn't be read. Try again in a minute."
            : state.error.message}
        </p>
        <Button variant="outline" size="sm" onClick={state.retry}>
          Try again
        </Button>
      </div>
    );

  return (
    <Ready
      state={state}
      searchPlaceholder={searchPlaceholder}
      showFilters={showFilters}
      roleFilter={roleFilter}
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
}: {
  state: Extract<ArchiveState, { status: "ready" }>;
  children: (props: ViewProps) => ReactNode;
  searchPlaceholder: string;
  showFilters: boolean;
  roleFilter: boolean;
}) {
  /* asked for by a person, as against a read behind the page: only this one
     dims the page, since only here are they waiting on it */
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<FilterState>(() =>
    typeof window === "undefined"
      ? DEFAULT_STATE
      : readState(window.location.search),
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    writeState(state, url.searchParams);
    window.history.replaceState(window.history.state, "", url);
  }, [state]);

  const filters = useMemo(() => toFilters(state), [state]);

  async function refresh() {
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
  }

  const freshness = (
    <Freshness
      fetchedAt={archive.fetchedAt}
      checking={checking}
      checkFailed={!refreshing && checkFailed !== null}
      onRefresh={() => void refresh()}
    />
  );

  return (
    <div className="space-y-6">
      {showFilters && (
        <FilterBar
          archive={archive}
          state={state}
          setState={setState}
          searchPlaceholder={searchPlaceholder}
          roleFilter={roleFilter}
          refresh={freshness}
        />
      )}
      {showFilters && <SheetNotice archive={archive} />}
      <div className={cn("transition-opacity", refreshing && "opacity-60")}>
        {children({
          archive,
          filters,
          refresh: () => void refresh(),
          refreshing,
        })}
      </div>
      {!showFilters && freshness}
    </div>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <RefreshCwIcon className="size-4 animate-spin" />
      {children}
    </p>
  );
}

/* the one slow load: a browser that has never read the archive, or not for a
   day. Saying how far it has got, and that it is only this once, keeps a few
   seconds from reading as a hang */
function FirstRead() {
  const { read, total } = useReadProgress();
  return (
    <div className="max-w-sm space-y-2" role="status">
      <Waiting>
        Reading every published article from WordPress…
        {total > 1 && (
          <span className="tabular-nums">
            {" "}
            {read} of {total}
          </span>
        )}
      </Waiting>
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
          /* a set width, so the search box beside it does not shift as the
             words change */
          "text-xs leading-tight sm:w-40 sm:text-right",
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
        size="sm"
        className="h-9"
        onClick={onRefresh}
        disabled={checking}
        aria-label="Refresh from WordPress"
      >
        <RefreshCwIcon className={cn(checking && "animate-spin")} />
        <span className="sr-only sm:not-sr-only">Refresh</span>
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
  refresh,
}: {
  archive: Archive;
  state: FilterState;
  setState: (state: FilterState) => void;
  searchPlaceholder: string;
  roleFilter: boolean;
  /** rereading WordPress, at the end of the row on every page */
  refresh: ReactNode;
}) {
  const changed = JSON.stringify(state) !== JSON.stringify(DEFAULT_STATE);

  return (
    <section aria-label="Filters" className="flex flex-wrap items-center gap-2">
      <Choice
        label="Period"
        hideLabel
        width="w-44"
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
          label="Role"
          all="Any role"
          options={ROLES.map((role) => ({
            value: role,
            label: ROLE_NAMES[role],
          }))}
          selected={state.roles}
          onChange={(roles) => setState({ ...state, roles: roles as Role[] })}
        />
      )}

      <label className="relative order-first w-full sm:order-none sm:w-auto sm:min-w-48 sm:flex-1">
        <span className="sr-only">Search</span>
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder={searchPlaceholder}
          className="bg-background h-9 pl-8"
          value={state.search}
          onChange={(event) =>
            setState({ ...state, search: event.target.value })
          }
        />
      </label>

      {changed && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => setState(DEFAULT_STATE)}
        >
          <XIcon /> Clear
        </Button>
      )}
      {refresh}
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
      className="bg-background h-9 w-auto"
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
              "bg-background h-9 font-normal",
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

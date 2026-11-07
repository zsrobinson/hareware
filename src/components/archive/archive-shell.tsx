import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronDownIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Choice } from "./choice";
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

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

async function fetchArchive(fresh: boolean): Promise<Archive> {
  const response = await fetch(`/api/archive.json${fresh ? "?fresh=1" : ""}`, {
    cache: fresh ? "no-store" : "default",
  });
  if (!response.ok)
    throw new Error(
      (await response.text()) || `HareWare answered ${response.status}`,
    );
  return response.json();
}

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
    <QueryClientProvider client={client}>
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
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({
    queryKey: ["archive"],
    queryFn: () => fetchArchive(false),
  });

  /* the bar renders only once the archive has loaded, which the server never
     waits for, so reading the url here cannot mismatch hydration */
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
      queryClient.setQueryData(["archive"], await fetchArchive(true));
    } catch (error) {
      console.error(error);
    } finally {
      setRefreshing(false);
    }
  }

  if (query.isPending)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <RefreshCwIcon className="size-4 animate-spin" />
        Loading every published article…
      </p>
    );
  if (query.isError)
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">{query.error.message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
    );

  const archive = query.data;

  return (
    <div className="space-y-6">
      {showFilters && (
        <FilterBar
          archive={archive}
          state={state}
          setState={setState}
          searchPlaceholder={searchPlaceholder}
          roleFilter={roleFilter}
          refresh={
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => void refresh()}
              disabled={refreshing}
              title={`Read from WordPress ${formatDateTime(archive.fetchedAt)}`}
            >
              <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
              <span className="sr-only sm:not-sr-only">Refresh</span>
            </Button>
          }
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
      {!showFilters && (
        <p className="text-muted-foreground text-xs">
          Read from WordPress {formatDateTime(archive.fetchedAt)}.
        </p>
      )}
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

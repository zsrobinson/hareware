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

export type ViewProps = { archive: Archive; filters: Filters };

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
  searchPlaceholder = "Titles and names",
}: {
  children: (props: ViewProps) => ReactNode;
  searchPlaceholder?: string;
}) {
  return (
    <QueryClientProvider client={client}>
      <Shell searchPlaceholder={searchPlaceholder}>{children}</Shell>
    </QueryClientProvider>
  );
}

function Shell({
  children,
  searchPlaceholder,
}: {
  children: (props: ViewProps) => ReactNode;
  searchPlaceholder: string;
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
        Reading every post from WordPress…
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
      <FilterBar
        archive={archive}
        state={state}
        setState={setState}
        searchPlaceholder={searchPlaceholder}
      />
      <SheetNotice archive={archive} />
      <div className={cn("transition-opacity", refreshing && "opacity-60")}>
        {children({ archive, filters })}
      </div>
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
        Read from WordPress {formatDateTime(archive.fetchedAt)}.
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
          Refresh from WordPress
        </Button>
      </p>
    </div>
  );
}

function SheetNotice({ archive }: { archive: Archive }) {
  const { sheet } = archive;
  if (sheet.status === "read" && archive.sheetProblems.length === 0)
    return null;

  const message =
    sheet.status === "unconfigured"
      ? "The Sheet is not connected, so pseudonyms are counted as their own people."
      : sheet.status === "failed"
        ? `The Sheet could not be read, so pseudonyms are counted as their own people. ${sheet.reason}`
        : `${archive.sheetProblems.length} row${archive.sheetProblems.length === 1 ? "" : "s"} in the Sheet could not be used. Problems lists them.`;

  return (
    <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      {message}
    </p>
  );
}

function FilterBar({
  archive,
  state,
  setState,
  searchPlaceholder,
}: {
  archive: Archive;
  state: FilterState;
  setState: (state: FilterState) => void;
  searchPlaceholder: string;
}) {
  const changed = JSON.stringify(state) !== JSON.stringify(DEFAULT_STATE);

  return (
    <section
      aria-label="Filters"
      className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-xl border p-2"
    >
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
      <MultiSelect
        label="Credited for"
        all="Any credit"
        options={ROLES.map((role) => ({
          value: role,
          label: ROLE_NAMES[role],
        }))}
        selected={state.roles}
        onChange={(roles) => setState({ ...state, roles: roles as Role[] })}
      />

      <label className="relative min-w-48 flex-1">
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
        : `${selected.length} ${label.toLowerCase()}`;

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

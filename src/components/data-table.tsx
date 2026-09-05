import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type FilterFn,
  type Header,
  type Row,
  type RowData,
  type SortingState,
  type Table as TableInstance,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { params, setParams } from "~/components/url-state";

/*
  a generic table: sorting that shows which way it went, a search across
  everything, a dropdown per filterable column built from the values actually
  present and counted, column visibility, a row that opens to show the whole
  of itself, keyboard movement, and pagination — with the whole view kept in
  the query string so it can be linked to.

  it knows nothing about invocations — the columns are passed in — so the next
  thing worth listing does not need a second one of these
*/

declare module "@tanstack/react-table" {
  /* the human name of a column, for the places the ui says one out loud: the
     visibility menu and the sortable header it builds for a string header */
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    /** how a value of this column reads in the filter dropdown */
    renderFacet?: (value: TValue & string, of?: TData) => ReactNode;
  }
}

export type FacetedFilter<T> = {
  id: Extract<keyof T, string>;
  label: string;
};

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** the columns offered as a dropdown of the values present */
  facets?: FacetedFilter<T>[];
  searchPlaceholder?: string;
  empty?: string;
  /** a stable id per row, so a link to one survives a re-sort */
  getRowId?: (row: T) => string;
  /** what a row shows when it is opened; rows do not open without it */
  detail?: (row: T) => ReactNode;
  /** drawn above the toolbar, with the table to hand */
  overview?: (table: TableInstance<T>) => ReactNode;
  /** drawn in the toolbar, before the column menu */
  toolbar?: (table: TableInstance<T>) => ReactNode;
  initialSorting?: SortingState;
  /** marks a row as worth noticing, without knowing why it is */
  rowAccent?: (row: T) => boolean;
  /** what the search box searches; the default is every column's raw value */
  globalFilterFn?: FilterFn<T>;
};

const label = <T,>(column: { id: string; columnDef: ColumnDef<T, unknown> }) =>
  column.columnDef.meta?.label ?? column.id;

export function DataTable<T>({
  columns,
  data,
  facets = [],
  searchPlaceholder = "Search…",
  empty = "Nothing to show.",
  getRowId,
  detail,
  overview,
  toolbar,
  initialSorting = [],
  rowAccent,
  globalFilterFn,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  const searchBox = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  /** the row the keyboard is on, by index within the page */
  const [cursor, setCursor] = useState<number | null>(null);

  const facetIds = useMemo(() => facets.map((facet) => facet.id), [facets]);

  /* tanstack table hands back functions the react compiler cannot follow, so
     it skips this component. that is the library's shape, not a mistake here */
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      expanded,
      globalFilter: search,
      pagination,
    },
    getRowId: getRowId
      ? (row: T, index: number) => getRowId(row) || String(index)
      : undefined,
    autoResetPageIndex: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    onGlobalFilterChange: setSearch,
    onPaginationChange: setPagination,
    globalFilterFn,
    getRowCanExpand: () => !!detail,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  /*
    the query string is read after mount rather than during render. astro
    renders this component on the server too, where there is no location, and
    a first paint that disagreed with the second is a hydration error
  */
  useEffect(() => {
    const query = params();

    const q = query.get("q");
    if (q) setSearch(q);

    const sort = query.get("sort");
    if (sort) {
      const [id, direction] = sort.split(":");
      if (id) setSorting([{ id, desc: direction !== "asc" }]);
    }

    const filters: ColumnFiltersState = facetIds
      .map((id) => ({
        id: id as string,
        value: query.get(id)?.split(",").filter(Boolean) ?? [],
      }))
      .filter((filter) => filter.value.length > 0);
    if (filters.length) setColumnFilters(filters);

    const row = query.get("row");
    if (row) {
      setExpanded({ [row]: true });
      /* after the row it names has been drawn — and read here rather than in
         an effect of its own, because the effect below rewrites the query
         string from state and the parameter is gone by the time one would run */
      requestAnimationFrame(() =>
        body.current
          ?.querySelector(`[data-row-id="${CSS.escape(row)}"]`)
          ?.scrollIntoView({ block: "center" }),
      );
    }
    // the query string is the starting point, not a second source of truth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* and written back on every change, so the address bar always describes what
     is on screen and a copied link reopens exactly it */
  useEffect(() => {
    const [first] = sorting;
    const open = Object.keys(expanded === true ? {} : expanded).filter(
      (id) => (expanded as Record<string, boolean>)[id],
    );

    setParams({
      q: search || null,
      sort: first ? `${first.id}:${first.desc ? "desc" : "asc"}` : null,
      row: open[0] ?? null,
      ...Object.fromEntries(
        facetIds.map((id) => {
          const value = columnFilters.find((filter) => filter.id === id)?.value;
          return [id, Array.isArray(value) ? value.join(",") || null : null];
        }),
      ),
    });
  }, [search, sorting, columnFilters, expanded, facetIds]);

  const rows = table.getRowModel().rows;
  const filtered = table.getFilteredRowModel().rows.length;
  const narrowed = columnFilters.length > 0 || !!search;

  /*
    a log is read by scrolling it, and a table you must aim at with a mouse to
    open one row is read more slowly than one you can walk down. j/k because
    the arrows already scroll the page, and `/` because every other log tool
    in the world focuses its search on it
  */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchBox.current?.focus();
        return;
      }

      if (event.key === "Escape" && typing) {
        (target as HTMLElement).blur();
        return;
      }

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      const move = event.key === "j" ? 1 : event.key === "k" ? -1 : 0;
      if (move) {
        event.preventDefault();
        setCursor((at) => {
          const next = at === null ? 0 : at + move;
          return Math.max(
            0,
            Math.min(next, table.getRowModel().rows.length - 1),
          );
        });
        return;
      }

      if (event.key === "Enter" && detail) {
        setCursor((at) => {
          if (at !== null) table.getRowModel().rows[at]?.toggleExpanded();
          return at;
        });
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [table, detail]);

  useEffect(() => {
    if (cursor === null) return;
    body.current
      ?.querySelector(`[data-cursor="true"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div className="space-y-3">
      {overview?.(table)}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Input
            ref={searchBox}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="peer h-9 w-full pr-8 sm:w-64"
          />
          <kbd className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs peer-focus:opacity-0">
            /
          </kbd>
        </div>

        {facets.map((facet) => {
          const column = table.getColumn(facet.id);
          if (!column) return null;

          const counts = column.getFacetedUniqueValues();
          const values = [...counts.keys()]
            .filter((value): value is string => typeof value === "string")
            .sort();
          const chosen = new Set((column.getFilterValue() as string[]) ?? []);
          const render = column.columnDef.meta?.renderFacet;

          return (
            <DropdownMenu key={facet.id}>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="lg" />}
              >
                {facet.label}
                {/* the values themselves while there is room for them: a
                    button reading "Outcome 2" says only that something is
                    hidden, and the point of the row is to say what */}
                {chosen.size > 0 && (
                  <span className="text-muted-foreground flex max-w-48 items-center gap-1 truncate text-xs">
                    {chosen.size <= 2
                      ? [...chosen].map((value) => (
                          <span key={value}>
                            {render ? render(value) : value}
                          </span>
                        ))
                      : `${chosen.size} selected`}
                  </span>
                )}
                <ChevronDownIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-80 overflow-y-auto"
              >
                {values.map((value) => (
                  <DropdownMenuCheckboxItem
                    key={value}
                    checked={chosen.has(value)}
                    onCheckedChange={(on) => {
                      const next = new Set(chosen);
                      if (on) next.add(value);
                      else next.delete(value);
                      column.setFilterValue(next.size ? [...next] : undefined);
                    }}
                  >
                    <span className="flex-1">
                      {render ? render(value) : value}
                    </span>
                    <span className="text-muted-foreground ml-3 tabular-nums">
                      {counts.get(value)}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
                {chosen.size > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => column.setFilterValue(undefined)}
                    >
                      Clear {facet.label.toLowerCase()}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}

        {toolbar?.(table)}

        {narrowed && (
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              setColumnFilters([]);
              setSearch("");
            }}
          >
            <XIcon className="size-4" />
            Clear
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="lg" className="ml-auto" />}
          >
            <SlidersHorizontalIcon className="size-4" />
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {label(column)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {detail && <TableHead className="w-8" />}
                {group.headers.map((header) => (
                  <SortableHead key={header.id} header={header} />
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody ref={body}>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (detail ? 1 : 0)}
                  className="text-muted-foreground h-24 text-center"
                >
                  {narrowed ? (
                    <span className="flex flex-col items-center gap-2">
                      Nothing matches those filters.
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setColumnFilters([]);
                          setSearch("");
                        }}
                      >
                        Clear them
                      </Button>
                    </span>
                  ) : (
                    empty
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <Line
                  key={row.id}
                  row={row}
                  detail={detail}
                  accent={rowAccent?.(row.original) ?? false}
                  cursor={cursor === index}
                  onPoint={() => setCursor(index)}
                  columns={columns.length}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {filtered === data.length
            ? `${data.length} rows`
            : `${filtered} of ${data.length} rows`}
          {detail && (
            <span className="ml-2 hidden sm:inline">
              · <kbd>j</kbd>/<kbd>k</kbd> to move, <kbd>enter</kbd> to open
            </span>
          )}
        </span>

        <div className="flex items-center gap-2">
          <select
            aria-label="Rows per page"
            value={pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
            className="border-border bg-background h-8 rounded-md border px-2 text-sm"
          >
            {[25, 50, 100, 500].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>

          <span className="tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {Math.max(1, table.getPageCount())}
          </span>

          <Button
            variant="outline"
            size="icon-sm"
            aria-label="First page"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ArrowRightIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Last page"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * a header that says it can be sorted, and which way it currently is.
 *
 * the old one drew the same two-headed arrow whether the column was sorted up,
 * down, or not at all, which is a control reporting none of its own state — a
 * table sorted oldest-first looked exactly like one sorted newest-first
 */
function SortableHead<T>({ header }: { header: Header<T, unknown> }) {
  const column = header.column;
  const sorted = column.getIsSorted();
  const definition = column.columnDef.header;

  const content = header.isPlaceholder
    ? null
    : flexRender(definition, header.getContext());

  if (!column.getCanSort() || typeof definition !== "string") {
    return <TableHead>{content}</TableHead>;
  }

  const Icon =
    sorted === "asc"
      ? ArrowUpIcon
      : sorted === "desc"
        ? ArrowDownIcon
        : ChevronsUpDownIcon;

  return (
    <TableHead
      aria-sort={
        sorted === "asc"
          ? "ascending"
          : sorted === "desc"
            ? "descending"
            : "none"
      }
      className="p-0"
    >
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-full justify-start rounded-none px-2 font-medium"
        onClick={() => column.toggleSorting(sorted === "asc")}
        title={`Sort by ${label(column).toLowerCase()}`}
      >
        {definition}
        <Icon
          className={cn("size-3.5", sorted ? "opacity-100" : "opacity-40")}
        />
      </Button>
    </TableHead>
  );
}

function Line<T>({
  row,
  detail,
  accent,
  cursor,
  onPoint,
  columns,
}: {
  row: Row<T>;
  detail?: (row: T) => ReactNode;
  accent: boolean;
  cursor: boolean;
  onPoint: () => void;
  columns: number;
}) {
  const open = row.getIsExpanded();

  return (
    <>
      <TableRow
        data-row-id={row.id}
        data-cursor={cursor}
        onMouseEnter={onPoint}
        onClick={(event) => {
          if (!detail) return;
          /* a row that swallows every click would eat the buttons inside it */
          if ((event.target as HTMLElement).closest("button,a,input,select")) {
            return;
          }
          row.toggleExpanded();
        }}
        className={cn(
          detail && "cursor-pointer",
          cursor && "bg-muted/40",
          accent && "shadow-[inset_2px_0_0_0_var(--color-destructive)]",
          open && "bg-muted/50 border-b-0",
        )}
      >
        {detail && (
          <TableCell className="w-8 pr-0 align-top">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-expanded={open}
              aria-label={open ? "Close details" : "Open details"}
              onClick={() => row.toggleExpanded()}
            >
              <ChevronRightIcon
                className={cn("transition-transform", open && "rotate-90")}
              />
            </Button>
          </TableCell>
        )}
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} className="align-top">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>

      {open && detail && (
        <TableRow className="bg-muted/50">
          <TableCell colSpan={columns + 1} className="p-0 whitespace-normal">
            {detail(row.original)}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

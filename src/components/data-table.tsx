import {
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { saveFile } from "~/lib/save-file";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  ChevronDownIcon,
  Columns3Icon,
  DownloadIcon,
  XIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toCsv } from "~/lib/csv";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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

/* a generic table: sorting, search, per-column facets, column visibility,
   pagination and csv export */

/**
 * a sortable header showing its direction. The column is typed structurally so
 * it fits any table's row type
 */
export function sortable(label: string, align: "left" | "right" = "left") {
  const Header = ({
    column,
  }: {
    column: {
      toggleSorting: (d?: boolean) => void;
      getIsSorted: () => false | string;
    };
  }) => {
    const sorted = column.getIsSorted();
    const Arrow =
      sorted === "asc"
        ? ArrowUpIcon
        : sorted === "desc"
          ? ArrowDownIcon
          : ArrowUpDownIcon;

    return (
      <Button
        variant="ghost"
        size="sm"
        /* the label lines up with its cells': out by the cell's padding, with
           the button's own padding and border on that side making it up, so
           the button stays inside the cell. A number column's header ends
           where its digits do, arrow first */
        className={
          align === "right"
            ? "-mr-2 ml-auto flex h-8 pr-[calc(--spacing(2)-1px)]"
            : "-ml-2 h-8 pl-[calc(--spacing(2)-1px)]"
        }
        onClick={() => column.toggleSorting(sorted === "asc")}
      >
        {align === "right" && (
          <Arrow className={sorted ? "size-3.5" : "size-3.5 opacity-60"} />
        )}
        {label}
        {align === "left" && (
          <Arrow className={sorted ? "size-3.5" : "size-3.5 opacity-60"} />
        )}
      </Button>
    );
  };
  return Header;
}

type FacetedFilter = {
  /** a column id, which need not be a key of the row */
  id: string;
  label: string;
};

/* declared on the column so an export cannot drift from a renamed column */
declare module "@tanstack/react-table" {
  /* merging must restate both of the library's parameters */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** the header this column writes into a csv, when its own is a component */
    csvHeader?: string;
  }
}

/** the table's own controls, for the page to place */
export type TableControls = {
  /** the Columns menu */
  columns: ReactNode;
  /** Download CSV, when the table has a `csv` name */
  download: ReactNode | null;
};

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** the columns offered as a dropdown of the values present */
  facets?: FacetedFilter[];
  searchPlaceholder?: string;
  /** false when a search outside the table already narrows `data` */
  searchable?: boolean;
  /** above the table, at its start: what it shows and how many */
  caption?: ReactNode;
  empty?: string;
  /**
   * when set, Download CSV exports what is currently on screen, named this
   * plus a date and `.csv`
   */
  csv?: string;
  /**
   * places the Columns menu and Download CSV elsewhere on the page, as an
   * archive page's toolbar and title row; without it they sit above the
   * table, at its end
   */
  controls?: (controls: TableControls) => ReactNode;
  /** the row whose details are open beside the table */
  selected?: (row: T) => boolean;
  /** the sort, when the page keeps it (in the address); the table's own otherwise */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /**
   * columns hidden until someone shows them from the Columns menu, as where
   * the table is narrow (a phone, a panel open beside it) and would otherwise
   * cut a value off at its edge
   */
  hidden?: string[];
  /** what someone chose in the Columns menu, when the page keeps it (to
      copy what is on screen); the table's own otherwise */
  picked?: VisibilityState;
  onPickedChange?: (picked: VisibilityState) => void;
  /** how the Columns menu says the columns differ from somewhere's own,
      as a page of saved views does */
  columnsChanged?: { className: string; description: string };
};

/* a header is often a component: `meta.csvHeader`, else the id. The Columns
   menu names them the same way, rather than by id */
const headerOf = <T,>(column: Column<T, unknown>): string => {
  const header = column.columnDef.header;
  return (
    column.columnDef.meta?.csvHeader ??
    (typeof header === "string" ? header : column.id)
  );
};

export function DataTable<T>({
  columns,
  data,
  facets = [],
  searchPlaceholder = "Search…",
  searchable = true,
  caption,
  empty = "Nothing to show.",
  csv,
  controls,
  selected,
  sorting: kept,
  onSortingChange: keep,
  hidden = [],
  picked: held,
  onPickedChange: hold,
  columnsChanged,
}: Props<T>) {
  const [unkept, setUnkept] = useState<SortingState>([]);
  const sorting = kept ?? unkept;
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  /* only what someone chose in the Columns menu: `hidden` is a default that
     moves with the width, so it is laid under the choices rather than kept */
  const [unheld, setUnheld] = useState<VisibilityState>({});
  const picked = held ?? unheld;
  const columnVisibility: VisibilityState = {
    ...Object.fromEntries(hidden.map((id) => [id, false])),
    ...picked,
  };
  const [search, setSearch] = useState("");

  /* the react compiler cannot follow tanstack table's functions and skips this */
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter: search },
    onSortingChange: (updater) =>
      (keep ?? setUnkept)(functionalUpdate(updater, sorting)),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: (updater) => {
      const next = functionalUpdate(updater, columnVisibility);
      const after = { ...picked };
      for (const [id, visible] of Object.entries(next))
        if (visible !== (columnVisibility[id] ?? true)) after[id] = visible;
      (hold ?? setUnheld)(after);
    },
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize: 25 } },
  });

  /* what is on screen: `getSortedRowModel()` is filtered and sorted but not
     paginated, and only visible columns are written */
  function exportCsv() {
    const shown = table.getVisibleLeafColumns();
    const rows = table.getSortedRowModel().rows;
    const headers = shown.map(headerOf);
    const body = rows.map((row) =>
      /* the accessor's value, not the rendered cell */
      shown.map((column) => row.getValue(column.id)),
    );

    const day = new Date().toISOString().slice(0, 10);
    saveFile(
      /* the BOM makes excel read utf-8 */
      new Blob(["﻿", toCsv(headers, body)], {
        type: "text/csv;charset=utf-8",
      }),
      `${csv}-${day}.csv`,
      "text/csv",
    );
  }

  const shownRows = table.getFilteredRowModel().rows.length;

  const own: TableControls = {
    columns: (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-description={columnsChanged?.description}
          render={
            <Button
              variant="outline"
              className={cn("bg-background", columnsChanged?.className)}
            />
          }
        >
          {/* an icon in a toolbar too narrow for its name (beside a panel) */}
          <Columns3Icon className="hidden @max-2xl:block" />
          <span className="@max-2xl:sr-only">Columns</span>
          <ChevronDownIcon className="text-muted-foreground @max-2xl:hidden" />
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
                {headerOf(column)}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    download: csv ? (
      <Button
        variant="outline"
        className="bg-background"
        onClick={exportCsv}
        disabled={shownRows === 0}
      >
        <DownloadIcon />
        Download CSV
      </Button>
    ) : null,
  };
  const placed = controls?.(own);

  const facetMenus =
    data.length === 0
      ? []
      : facets.flatMap((facet) => {
          const column = table.getColumn(facet.id);
          if (!column) return [];

          const values = [...column.getFacetedUniqueValues().keys()]
            .filter((value): value is string => typeof value === "string")
            .sort();
          const chosen = new Set((column.getFilterValue() as string[]) ?? []);

          return [
            <DropdownMenu key={facet.id}>
              <DropdownMenuTrigger
                aria-label={facet.label}
                render={
                  <Button
                    variant="outline"
                    className="bg-background font-normal"
                  />
                }
              >
                {chosen.size === 0
                  ? facet.label
                  : chosen.size === 1
                    ? [...chosen][0]
                    : `${chosen.size} selected`}
                <ChevronDownIcon className="text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
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
                    {value}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>,
          ];
        });

  const any = data.length > 0;
  const top = (caption ||
    facetMenus.length > 0 ||
    (any && (searchable || !controls))) && (
    <div className="flex flex-wrap items-center gap-2">
      {caption}
      {any && searchable && (
        <Input
          type="search"
          aria-label="Search the table"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          className="bg-background max-w-xs"
        />
      )}
      {facetMenus}
      {(columnFilters.length > 0 || search) && (
        <Button
          variant="ghost"
          onClick={() => {
            setColumnFilters([]);
            setSearch("");
          }}
        >
          <XIcon /> Clear
        </Button>
      )}
      {/* as an archive page's toolbar: filters, a divider, then the view */}
      {any && !controls && (
        <span className="flex flex-wrap items-center gap-2 border-l pl-2">
          {own.columns}
          {own.download}
        </span>
      )}
    </div>
  );

  /* nothing to sort, export or page through: say so and stop */
  if (data.length === 0)
    return (
      <div className="space-y-3">
        {placed}
        {top}
        <p className="text-muted-foreground rounded-lg border px-4 py-8 text-center text-sm">
          {empty}
        </p>
      </div>
    );

  const { pageIndex, pageSize } = table.getState().pagination;
  return (
    <div className="space-y-3">
      {placed}
      {top}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="text-muted-foreground h-24 text-center"
                >
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={selected?.(row.original) ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="align-top">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
          <span className="tabular-nums">
            {pageIndex * pageSize + 1}–
            {Math.min((pageIndex + 1) * pageSize, shownRows)} of {shownRows}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

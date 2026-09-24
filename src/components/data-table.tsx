import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import download from "downloadjs";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  ChevronDownIcon,
  DownloadIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useState } from "react";
import { toCsv } from "~/lib/csv";
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
export function sortable(label: string) {
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
        className="-ml-2 h-8"
        onClick={() => column.toggleSorting(sorted === "asc")}
      >
        {label}
        <Arrow className={sorted ? "size-3.5" : "size-3.5 opacity-60"} />
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

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** the columns offered as a dropdown of the values present */
  facets?: FacetedFilter[];
  searchPlaceholder?: string;
  empty?: string;
  /**
   * when set, a download button exporting what is currently on screen, named
   * this plus a date and `.csv`
   */
  csv?: string;
};

export function DataTable<T>({
  columns,
  data,
  facets = [],
  searchPlaceholder = "Search…",
  empty = "Nothing to show.",
  csv,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [search, setSearch] = useState("");

  /* the react compiler cannot follow tanstack table's functions and skips this */
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter: search },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
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

    const headers = shown.map((column) => {
      const header = column.columnDef.header;
      /* a header is often a component; `meta.csvHeader`, else the id */
      return (
        column.columnDef.meta?.csvHeader ??
        (typeof header === "string" ? header : column.id)
      );
    });

    const body = rows.map((row) =>
      /* the accessor's value, not the rendered cell */
      shown.map((column) => row.getValue(column.id)),
    );

    const day = new Date().toISOString().slice(0, 10);
    download(
      /* the BOM makes excel read utf-8 */
      new Blob(["\uFEFF", toCsv(headers, body)], {
        type: "text/csv;charset=utf-8",
      }),
      `${csv}-${day}.csv`,
      "text/csv",
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 max-w-xs"
        />

        {facets.map((facet) => {
          const column = table.getColumn(facet.id);
          if (!column) return null;

          const values = [...column.getFacetedUniqueValues().keys()]
            .filter((value): value is string => typeof value === "string")
            .sort();
          const chosen = new Set((column.getFilterValue() as string[]) ?? []);

          return (
            <DropdownMenu key={facet.id}>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" className="h-9" />}
              >
                {facet.label}
                {chosen.size > 0 && (
                  <span className="bg-muted ml-1 rounded px-1 text-xs">
                    {chosen.size}
                  </span>
                )}
                <ChevronDownIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
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
            </DropdownMenu>
          );
        })}

        {(columnFilters.length > 0 || search) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setColumnFilters([]);
              setSearch("");
            }}
          >
            Clear
          </Button>
        )}

        {csv && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-9"
            onClick={exportCsv}
            disabled={table.getFilteredRowModel().rows.length === 0}
          >
            <DownloadIcon className="size-4" />
            Export CSV
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className={csv ? "h-9" : "ml-auto h-9"}
              />
            }
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
                  {column.id}
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
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground h-24 text-center"
                >
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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

      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>
          {table.getFilteredRowModel().rows.length} of {data.length}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

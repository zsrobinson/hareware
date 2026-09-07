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

/*
  a generic table: sorting, a search across everything, a dropdown per
  filterable column built from the values actually present, column visibility
  and pagination.

  it knows nothing about invocations — the columns are passed in — so the next
  thing worth listing does not need a second one of these
*/

/**
 * a header that says it can be sorted, and which way it currently is.
 *
 * here rather than in each table, so the arrow means the same thing on every
 * one of them. the column is typed structurally because a `HeaderContext` is
 * generic in the row type and this has to sit in any table's columns
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

export type FacetedFilter = {
  /*
    a column id, not a key of the row.

    it was `Extract<keyof T, string>` while the log was the only consumer,
    whose columns are all plain accessor keys. Standing's are not — `status`
    reads through `person`, and `qualifies` is computed — so the constraint
    was rejecting the columns it was meant to describe. `getColumn` already
    returns undefined for a name that does not exist, and the render below
    already skips that case
  */
  id: string;
  label: string;
};

/*
  what a column can say about its own export.

  declaration merging rather than a parallel map of column id to getter: the
  two would drift the moment somebody renamed a column, and the compiler would
  not notice — an export silently missing a column is exactly the kind of quiet
  wrong this feature cannot afford
*/
declare module "@tanstack/react-table" {
  /* both parameters are part of the library's declaration and have to be
     restated to merge into it, even though only the row type is used here */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** the header this column writes into a csv, when its own is a component */
    csvHeader?: string;
  }
}

/**
 * opt-in csv export, per ADR 0010.
 *
 * a prop rather than a second component, because that ADR leans on the promise
 * this file's header makes: every surface it adds is a table, so the export is
 * added here once and all of them inherit it. forking the component would
 * break that promise on the day it was first tested
 */
type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** the columns offered as a dropdown of the values present */
  facets?: FacetedFilter[];
  searchPlaceholder?: string;
  empty?: string;
  /** when set, a download button exporting what is currently on screen */
  /** the filename, without an extension; a date and `.csv` are appended */
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

  /* tanstack table hands back functions the react compiler cannot follow, so
     it skips this component. that is the library's shape, not a mistake here */
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

  /*
    exports what is on screen, not `data`.

    `getSortedRowModel()` is the filtered *and* sorted model with pagination
    not yet applied, which is the whole point of exporting from a table rather
    than from the page's props: an editor narrows the roster to the people they
    are asking about and the file holds those people, in that order. exporting
    `data` would hand them the raw list back and quietly ignore every control
    above the table.

    only visible columns, for the same reason — a hidden column is a column the
    person said they did not want to see
  */
  function exportCsv() {
    const shown = table.getVisibleLeafColumns();
    const rows = table.getSortedRowModel().rows;

    const headers = shown.map((column) => {
      const header = column.columnDef.header;
      /* a header is often a component — a sortable button, in every consumer
         here — and rendering react to a string is not something a csv should
         attempt. the column id is the fallback, and a consumer that wants
         better spelling sets `meta.csvHeader` */
      return (
        column.columnDef.meta?.csvHeader ??
        (typeof header === "string" ? header : column.id)
      );
    });

    const body = rows.map((row) =>
      /* the accessor's value, not the rendered cell: a badge, an icon and a
         dash standing in for "none" are all presentation, and a column whose
         accessor is not printable should fix its accessor rather than grow a
         second one for the export */
      shown.map((column) => row.getValue(column.id)),
    );

    /* dated in the filename because these are snapshots of a question asked on
       a day, and an election leaves three of them in a downloads folder */
    const day = new Date().toISOString().slice(0, 10);
    download(
      /* the BOM is what makes excel read utf-8 rather than latin-1, which is
         the difference between "Zoë" and "ZoÃ«" in a name column */
      new Blob(["﻿", toCsv(headers, body)], {
        type: "text/csv;charset=utf-8",
      }),
      /* only ever called from a button rendered under `csv &&` */
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

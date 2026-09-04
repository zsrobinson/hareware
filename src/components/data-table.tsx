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
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
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
};

export function DataTable<T>({
  columns,
  data,
  facets = [],
  searchPlaceholder = "Search…",
  empty = "Nothing to show.",
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

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="ml-auto h-9" />
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

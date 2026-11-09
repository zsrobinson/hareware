import {
  ArrowDownIcon,
  ArrowDownWideNarrowIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  LayoutGridIcon,
} from "lucide-react";
import { useId } from "react";
import { FieldRows } from "~/components/field-row";
import { Button } from "~/components/ui/button";
import { BuilderRow, ChartBuilder } from "./chart-builder";
import { Choice } from "./choice";
import { PivotBuilder } from "./pivot-builder";
import { moveColumn, switchLayout, withColumn, type Shape } from "./view-state";
import {
  COLUMN_NAMES,
  COLUMNS,
  type ColumnId,
  type Source,
  type TableSort,
} from "./views";

const LAYOUTS: { id: Shape["type"]; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "chart", label: "Chart" },
  { id: "pivot", label: "Pivot" },
];

/**
 * The Customize panel: how the view shows what it counts, and the settings
 * of that layout. Every change is one of view-state's, so what the builder
 * can make is what a declaration can say.
 */
export function ViewBuilder({
  source,
  shape,
  sort,
  onChange,
  onSort,
}: {
  source: Source;
  shape: Shape;
  sort: TableSort;
  onChange: (shape: Shape) => void;
  onSort: (sort: TableSort) => void;
}) {
  return (
    <FieldRows>
      <BuilderRow icon={LayoutGridIcon} label="Show as">
        <Choice
          label="Show as"
          hideLabel
          width="w-full"
          value={shape.type}
          options={LAYOUTS}
          onChange={(type) => onChange(switchLayout(shape, type, source))}
        />
      </BuilderRow>
      {shape.type === "chart" ? (
        <ChartBuilder
          config={shape.chart}
          onChange={(chart) => onChange({ type: "chart", chart })}
        />
      ) : shape.type === "pivot" ? (
        <PivotBuilder
          config={shape.pivot}
          onChange={(pivot) => onChange({ type: "pivot", pivot })}
        />
      ) : (
        <TableBuilder
          source={source}
          columns={shape.columns}
          sort={sort}
          onColumns={(columns) => onChange({ type: "table", columns })}
          onSort={onSort}
        />
      )}
    </FieldRows>
  );
}

function TableBuilder({
  source,
  columns,
  sort,
  onColumns,
  onSort,
}: {
  source: Source;
  columns: readonly ColumnId[];
  sort: TableSort;
  onColumns: (columns: readonly ColumnId[]) => void;
  onSort: (sort: TableSort) => void;
}) {
  const ids = useId();
  /* shown first, in their order, then the rest as the table lists them */
  const all: readonly ColumnId[] = COLUMNS[source];
  const listed = [...columns, ...all.filter((id) => !columns.includes(id))];
  return (
    <>
      <BuilderRow icon={ArrowDownWideNarrowIcon} label="Sort by">
        <Choice
          label="Sort by"
          hideLabel
          width="w-full"
          value={sort.id}
          options={columns.map((id) => ({ id, label: COLUMN_NAMES[id] }))}
          onChange={(id) => onSort({ ...sort, id })}
        />
      </BuilderRow>
      <BuilderRow icon={ArrowUpDownIcon} label="Order">
        <Choice
          label="Order"
          hideLabel
          width="w-full"
          value={sort.desc ? "desc" : "asc"}
          options={[
            { id: "asc", label: "Ascending" },
            { id: "desc", label: "Descending" },
          ]}
          onChange={(order) => onSort({ ...sort, desc: order === "desc" })}
        />
      </BuilderRow>
      <fieldset className="space-y-1">
        <legend className="text-muted-foreground mb-1 text-xs font-medium">
          Columns
        </legend>
        <ul className="divide-y rounded-lg border text-sm">
          {listed.map((id) => {
            const shown = columns.includes(id);
            const at = columns.indexOf(id);
            const name = COLUMN_NAMES[id];
            return (
              <li key={id} className="flex items-center gap-2 py-0.5 pr-1 pl-3">
                <input
                  id={`${ids}-${id}`}
                  type="checkbox"
                  className="accent-foreground size-4"
                  checked={shown}
                  /* a table keeps one column at least */
                  disabled={shown && columns.length === 1}
                  onChange={(event) =>
                    onColumns(withColumn(columns, id, event.target.checked))
                  }
                />
                <label htmlFor={`${ids}-${id}`} className="flex-1 py-1.5">
                  {name}
                </label>
                {shown && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${name} earlier`}
                      disabled={at === 0}
                      onClick={() => onColumns(moveColumn(columns, id, -1))}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${name} later`}
                      disabled={at === columns.length - 1}
                      onClick={() => onColumns(moveColumn(columns, id, 1))}
                    >
                      <ArrowDownIcon />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>
    </>
  );
}

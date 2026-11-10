import {
  ArrowDownIcon,
  ArrowDownWideNarrowIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  LayoutGridIcon,
  UsersRoundIcon,
} from "lucide-react";
import { useId } from "react";
import { FieldRows } from "~/components/field-row";
import { Button } from "~/components/ui/button";
import { BuilderRow, ChartBuilder } from "./chart-builder";
import { Choice } from "./choice";
import { PivotBuilder } from "./pivot-builder";
import { cn } from "~/lib/utils";
import { moveColumn, switchLayout, withColumn, type Shape } from "./view-state";
import {
  COLUMN_NAMES,
  COLUMNS,
  type ColumnId,
  type Source,
  type TableSort,
  type View,
} from "./views";

const LAYOUTS: { id: Shape["type"]; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "chart", label: "Chart" },
  { id: "pivot", label: "Pivot" },
];

/**
 * The Customize panel: how the view shows what it counts, and the settings
 * of that layout. Every change is one of view-state's, so what the builder
 * can make is what a declaration can say. A setting that differs from the
 * view as saved says what it was there.
 */
export function ViewBuilder({
  source,
  shape,
  sort,
  saved,
  views,
  onChange,
  onSort,
}: {
  source: Source;
  shape: Shape;
  sort: TableSort;
  /** the view as saved, and the sort it opens on */
  saved: { view: View; shape: Shape; sort: TableSort };
  /** the page's views, whose first chart or pivot a new layout starts from */
  views: readonly View[];
  onChange: (shape: Shape) => void;
  onSort: (sort: TableSort) => void;
}) {
  const was = saved.shape;
  return (
    <FieldRows>
      <BuilderRow
        icon={LayoutGridIcon}
        label="Show as"
        saved={
          was.type === shape.type
            ? undefined
            : LAYOUTS.find((l) => l.id === was.type)?.label
        }
      >
        <Choice
          label="Show as"
          hideLabel
          width="w-full"
          value={shape.type}
          options={LAYOUTS}
          onChange={(type) =>
            onChange(switchLayout(shape, type, views, saved.view))
          }
        />
      </BuilderRow>
      {shape.type === "chart" ? (
        <ChartBuilder
          config={shape.chart}
          saved={was.type === "chart" ? was.chart : undefined}
          onChange={(chart) => onChange({ type: "chart", chart })}
        />
      ) : shape.type === "pivot" ? (
        <PivotBuilder
          config={shape.pivot}
          saved={was.type === "pivot" ? was.pivot : undefined}
          onChange={(pivot) => onChange({ type: "pivot", pivot })}
        />
      ) : (
        <TableBuilder
          source={source}
          columns={shape.columns}
          only={shape.only}
          sort={sort}
          saved={{
            columns: was.type === "table" ? was.columns : null,
            only: was.type === "table" ? was.only : undefined,
            sort: saved.sort,
          }}
          onColumns={(columns) =>
            onChange({ type: "table", columns, only: shape.only })
          }
          onOnly={(only) =>
            onChange({ type: "table", columns: shape.columns, only })
          }
          onSort={onSort}
        />
      )}
    </FieldRows>
  );
}

function TableBuilder({
  source,
  columns,
  only,
  sort,
  saved,
  onColumns,
  onOnly,
  onSort,
}: {
  source: Source;
  columns: readonly ColumnId[];
  only: "new" | undefined;
  sort: TableSort;
  /** the table as saved; no columns where the view is saved as a chart or a pivot */
  saved: {
    columns: readonly ColumnId[] | null;
    only: "new" | undefined;
    sort: TableSort;
  };
  onColumns: (columns: readonly ColumnId[]) => void;
  onOnly: (only: "new" | undefined) => void;
  onSort: (sort: TableSort) => void;
}) {
  const ids = useId();
  /* shown first, in their order, then the rest as the table lists them */
  const all: readonly ColumnId[] = COLUMNS[source];
  const listed = [...columns, ...all.filter((id) => !columns.includes(id))];
  const columnsChanged =
    saved.columns !== null && saved.columns.join() !== columns.join();
  return (
    <>
      {source === "people" && (
        <BuilderRow
          icon={UsersRoundIcon}
          label="People"
          saved={
            saved.columns !== null && saved.only !== only
              ? saved.only === "new"
                ? "New in the range"
                : "Everyone"
              : undefined
          }
        >
          <Choice
            label="People"
            hideLabel
            width="w-full"
            value={only ?? "everyone"}
            options={[
              { id: "everyone", label: "Everyone" },
              { id: "new", label: "New in the range" },
            ]}
            onChange={(id) => onOnly(id === "new" ? "new" : undefined)}
          />
        </BuilderRow>
      )}
      <BuilderRow
        icon={ArrowDownWideNarrowIcon}
        label="Sort by"
        saved={
          saved.sort.id !== sort.id ? COLUMN_NAMES[saved.sort.id] : undefined
        }
      >
        <Choice
          label="Sort by"
          hideLabel
          width="w-full"
          value={sort.id}
          options={columns.map((id) => ({ id, label: COLUMN_NAMES[id] }))}
          onChange={(id) => onSort({ ...sort, id })}
        />
      </BuilderRow>
      <BuilderRow
        icon={ArrowUpDownIcon}
        label="Order"
        saved={
          saved.sort.desc !== sort.desc
            ? saved.sort.desc
              ? "Descending"
              : "Ascending"
            : undefined
        }
      >
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
        <legend
          className={cn(
            "text-muted-foreground mb-1 text-xs font-medium",
            columnsChanged && "text-edited",
          )}
        >
          Columns
          {columnsChanged && (
            <span className="font-normal">
              {" "}
              · saved: {saved.columns!.map((id) => COLUMN_NAMES[id]).join(", ")}
            </span>
          )}
        </legend>
        <ul
          className={cn(
            "divide-y rounded-lg border text-sm",
            columnsChanged && "border-edited/30",
          )}
        >
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

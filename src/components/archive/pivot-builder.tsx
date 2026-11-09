import {
  Columns3Icon,
  HashIcon,
  PercentIcon,
  Rows3Icon,
  UsersIcon,
} from "lucide-react";
import { FieldRows } from "~/components/field-row";
import { isQuantity } from "~/lib/credits/stats";
import { BuilderRow, CompareRow } from "./chart-builder";
import { COUNTS, TOPS } from "./chart-config";
import { COMPARES } from "./compare";
import { Choice } from "./choice";
import {
  allowsPivot,
  DIMENSIONS,
  PIVOT_VALUES,
  settlePivot,
  type PivotConfig,
} from "./pivot-config";

/**
 * A pivot's rows in the Customize panel. As for a chart, an option that
 * would move another is off (see `allowsPivot`), so no choice changes a
 * setting it was not made in.
 */
export function PivotBuilder({
  config,
  saved,
  onChange,
}: {
  config: PivotConfig;
  /** the view's pivot as saved, whose settings a changed row says */
  saved?: PivotConfig;
  onChange: (next: PivotConfig) => void;
}) {
  const set = (patch: Partial<PivotConfig>) =>
    onChange(settlePivot({ ...config, ...patch }));
  const ok = allowsPivot(config);
  const was = (
    key: keyof PivotConfig,
    options: { id: string; label: string }[],
  ) =>
    saved && saved[key] !== config[key]
      ? (options.find((o) => o.id === String(saved[key]))?.label ?? "")
      : undefined;
  const columns = [{ id: "none" as const, label: "Nothing" }, ...DIMENSIONS];
  const tops = TOPS.map((n) => ({
    id: String(n),
    label: n === 0 ? "Everyone" : `Top ${n}`,
  }));

  return (
    <FieldRows>
      <BuilderRow icon={HashIcon} label="Count" saved={was("count", COUNTS)}>
        <Choice
          label="Count"
          hideLabel
          width="w-full"
          value={config.count}
          options={COUNTS.map((c) => ({ ...c, disabled: !ok.count[c.id] }))}
          onChange={(count) => set({ count })}
        />
      </BuilderRow>
      <BuilderRow icon={Rows3Icon} label="Rows" saved={was("rows", DIMENSIONS)}>
        <Choice
          label="Rows"
          hideLabel
          width="w-full"
          value={config.rows}
          options={DIMENSIONS.map((d) => ({ ...d, disabled: !ok.rows[d.id] }))}
          onChange={(rows) => set({ rows })}
        />
      </BuilderRow>
      <BuilderRow
        icon={Columns3Icon}
        label="Columns"
        saved={was("columns", columns)}
      >
        <Choice
          label="Columns"
          hideLabel
          width="w-full"
          value={config.columns}
          options={columns.map((d) => ({ ...d, disabled: !ok.columns[d.id] }))}
          onChange={(columns) => set({ columns })}
        />
      </BuilderRow>
      <BuilderRow
        icon={PercentIcon}
        label="Values"
        saved={was("values", PIVOT_VALUES)}
      >
        <Choice
          label="Values"
          hideLabel
          width="w-full"
          value={config.values}
          options={PIVOT_VALUES.filter(
            (v) => v.id !== "per-article" || isQuantity(config.count),
          ).map((v) => ({
            ...v,
            disabled: !ok.values[v.id],
          }))}
          onChange={(values) => set({ values })}
        />
      </BuilderRow>
      <CompareRow
        value={config.compare}
        allowed={ok.compare}
        saved={was("compare", COMPARES)}
        onChange={(compare) => set({ compare })}
      />
      {ok.top && (
        <BuilderRow icon={UsersIcon} label="Show" saved={was("top", tops)}>
          <Choice
            label="Show"
            hideLabel
            width="w-full"
            value={String(config.top)}
            options={tops}
            onChange={(top) => set({ top: Number(top) })}
          />
        </BuilderRow>
      )}
    </FieldRows>
  );
}

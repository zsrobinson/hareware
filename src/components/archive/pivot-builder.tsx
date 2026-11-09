import {
  Columns3Icon,
  HashIcon,
  PercentIcon,
  Rows3Icon,
  UsersIcon,
} from "lucide-react";
import { FieldRows } from "~/components/field-row";
import { BuilderRow } from "./chart-builder";
import { COUNTS, TOPS } from "./chart-config";
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
  onChange,
}: {
  config: PivotConfig;
  onChange: (next: PivotConfig) => void;
}) {
  const set = (patch: Partial<PivotConfig>) =>
    onChange(settlePivot({ ...config, ...patch }));
  const ok = allowsPivot(config);

  return (
    <FieldRows>
      <BuilderRow icon={HashIcon} label="Count">
        <Choice
          label="Count"
          hideLabel
          width="w-full"
          value={config.count}
          options={COUNTS.map((c) => ({ ...c, disabled: !ok.count[c.id] }))}
          onChange={(count) => set({ count })}
        />
      </BuilderRow>
      <BuilderRow icon={Rows3Icon} label="Rows">
        <Choice
          label="Rows"
          hideLabel
          width="w-full"
          value={config.rows}
          options={DIMENSIONS.map((d) => ({ ...d, disabled: !ok.rows[d.id] }))}
          onChange={(rows) => set({ rows })}
        />
      </BuilderRow>
      <BuilderRow icon={Columns3Icon} label="Columns">
        <Choice
          label="Columns"
          hideLabel
          width="w-full"
          value={config.columns}
          options={[
            { id: "none" as const, label: "Nothing" },
            ...DIMENSIONS,
          ].map((d) => ({ ...d, disabled: !ok.columns[d.id] }))}
          onChange={(columns) => set({ columns })}
        />
      </BuilderRow>
      <BuilderRow icon={PercentIcon} label="Values">
        <Choice
          label="Values"
          hideLabel
          width="w-full"
          value={config.values}
          options={PIVOT_VALUES.map((v) => ({
            ...v,
            disabled: !ok.values[v.id],
          }))}
          onChange={(values) => set({ values })}
        />
      </BuilderRow>
      {ok.top && (
        <BuilderRow icon={UsersIcon} label="Show">
          <Choice
            label="Show"
            hideLabel
            width="w-full"
            value={String(config.top)}
            options={TOPS.map((n) => ({
              id: String(n),
              label: n === 0 ? "Everyone" : `Top ${n}`,
            }))}
            onChange={(top) => set({ top: Number(top) })}
          />
        </BuilderRow>
      )}
    </FieldRows>
  );
}

import {
  ArrowDownWideNarrowIcon,
  ChartColumnIcon,
  GitCompareArrowsIcon,
  GroupIcon,
  HashIcon,
  LayersIcon,
  PercentIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { FieldRow, FieldRows } from "~/components/field-row";
import { isPeriod, isQuantity } from "~/lib/credits/stats";
import {
  allows,
  COUNTS,
  DRAWS,
  GROUPINGS,
  ORDERS,
  settle,
  SPLITS,
  TOPS,
  VALUES,
  type ChartConfig,
  type Draw,
  type Values,
} from "./chart-config";
import { Choice } from "./choice";
import { COMPARES, type Compare } from "./compare";

/**
 * The Customize panel's rows. What is counted, grouped and split never moves
 * by itself: an option that would move another is off (see `allows`). Only
 * how the chart is drawn follows the axis, settled on every change.
 */
export function ChartBuilder({
  config,
  onChange,
}: {
  config: ChartConfig;
  onChange: (next: ChartConfig) => void;
}) {
  const set = (patch: Partial<ChartConfig>) =>
    onChange(settle({ ...config, ...patch }));
  const ok = allows(config);
  const time = isPeriod(config.by);
  const split = config.split !== "none";

  const drawLabel: Record<Draw, string> = time
    ? {
        stacked: split ? "Stacked columns" : "Columns",
        grouped: "Side-by-side columns",
        lines: "Lines",
      }
    : { stacked: "Stacked bars", grouped: "Side-by-side bars", lines: "Lines" };
  const valueLabel: Record<Values, string> = {
    number: "Number",
    share: split ? "Share of each" : "Share of all",
    running: "Running total",
    "per-article": "Per article",
  };
  const natural =
    config.by === "section"
      ? "Section order"
      : config.by === "role"
        ? "Role order"
        : "A to Z";

  /* a choice with one option is no choice: draw is only offered where it varies */
  const comparing = config.compare !== "none";
  const draws = DRAWS.filter((draw) => draw !== "grouped" || split || comparing)
    .filter((draw) => draw !== "lines" || time)
    .filter((draw) => draw !== "stacked" || !comparing);

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
      <BuilderRow icon={GroupIcon} label="Group by">
        <Choice
          label="Group by"
          hideLabel
          width="w-full"
          value={config.by}
          options={GROUPINGS.map((g) => ({ ...g, disabled: !ok.by[g.id] }))}
          onChange={(by) => set({ by })}
        />
      </BuilderRow>
      <BuilderRow icon={LayersIcon} label="Split by">
        <Choice
          label="Split by"
          hideLabel
          width="w-full"
          value={config.split}
          options={SPLITS.map((s) => ({ ...s, disabled: !ok.split[s.id] }))}
          onChange={(split) => set({ split })}
        />
      </BuilderRow>
      {draws.length > 1 && (
        <BuilderRow icon={ChartColumnIcon} label="Draw as">
          <Choice
            label="Draw as"
            hideLabel
            width="w-full"
            value={config.draw}
            options={draws.map((id) => ({
              id,
              label: drawLabel[id],
              disabled: !ok.draw[id],
            }))}
            onChange={(draw) => set({ draw })}
          />
        </BuilderRow>
      )}
      <BuilderRow icon={PercentIcon} label="Values">
        <Choice
          label="Values"
          hideLabel
          width="w-full"
          value={config.values}
          options={VALUES.filter(
            (id) =>
              (id !== "running" || time) &&
              (id !== "per-article" || isQuantity(config.count)),
          ).map((id) => ({
            id,
            label: valueLabel[id],
            disabled: !ok.values[id],
          }))}
          onChange={(values) => set({ values })}
        />
      </BuilderRow>
      <CompareRow
        value={config.compare}
        allowed={ok.compare}
        onChange={(compare) => set({ compare })}
      />
      {ok.order && (
        <BuilderRow icon={ArrowDownWideNarrowIcon} label="Order">
          <Choice
            label="Order"
            hideLabel
            width="w-full"
            value={config.order}
            options={ORDERS.map((id) => ({
              id,
              label: id === "largest" ? "Largest first" : natural,
            }))}
            onChange={(order) => set({ order })}
          />
        </BuilderRow>
      )}
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

/** Compare with, for a chart or a pivot: what each category is set beside */
export function CompareRow({
  value,
  allowed,
  onChange,
}: {
  value: Compare;
  allowed: Record<Compare, boolean>;
  onChange: (compare: Compare) => void;
}) {
  return (
    /* "Compare with" is the one label the panel's column would wrap */
    <BuilderRow icon={GitCompareArrowsIcon} label="Compare">
      <Choice
        label="Compare with"
        hideLabel
        width="w-full"
        value={value}
        options={COMPARES.map((c) => ({ ...c, disabled: !allowed[c.id] }))}
        onChange={onChange}
      />
    </BuilderRow>
  );
}

/** one setting in the Customize panel: its icon, its name, its control */
export function BuilderRow({
  icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <FieldRow
      icon={icon}
      label={<span aria-hidden>{label}</span>}
      inline
      width="panel"
    >
      {children}
    </FieldRow>
  );
}

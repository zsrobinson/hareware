import type { LayoutState } from "./layout-state";

export type PartialValues<T> = { [K in keyof T]: Partial<T[K]> };
export type LayoutPreset = PartialValues<LayoutState>;

// prettier-ignore
const whitePreset = {
  title: { color: "#5b2218", size: 24 },
  author: { color: "#5b2218", size: 14 },
  logo: { variant: "circle", size: 48, filter: "none", opacity: 1, position: "inline" },
  background: { padding: 12, color: "#ffffff" }
};

// prettier-ignore
const pinkPreset = {
  title: { color: "#5b2218", size: 24 },
  author: { color: "#5b2218", size: 14 },
  logo: { variant: "circle", size: 48, filter: "none", opacity: 1, position: "inline" },
  background: { padding: 12, color: "#ffd9d0" }
}

// prettier-ignore
const maroonPreset = {
  title: { color: "#ffffff", size: 24 },
  author: { color: "#ffffff", size: 14 },
  logo: { variant: "circle", size: 48, filter: "none", opacity: 1, position: "inline" },
  background: { padding: 12, color: "#5b2118" }
}

export const presets: Record<string, LayoutPreset> = {
  white: whitePreset,
  pink: pinkPreset,
  maroon: maroonPreset,
};

export function isCurrentPreset(
  state: LayoutState,
  preset: LayoutPreset,
): boolean {
  return Object.entries(preset).every(([presetKey, presetValue]) =>
    Object.entries(presetValue).every(
      ([propKey, propValue]) =>
        propValue === (state[presetKey as keyof LayoutState] as any)[propKey],
    ),
  );
}

export const DEFAULT_PRESET = maroonPreset;

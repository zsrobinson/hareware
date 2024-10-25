import type { LayoutState } from "./layout-state";

export type Preset = { textColor: string; bgColor: string };

export const presets = {
  white: { textColor: "#5b2218", bgColor: "#ffffff" },
  pink: { textColor: "#5b2218", bgColor: "#ffd9d0" },
  maroon: { textColor: "#ffffff", bgColor: "#5b2118" },
};

export function isCurrentPreset(state: LayoutState, preset: Preset) {
  return (
    state.textColor === preset.textColor && state.bgColor === preset.bgColor
  );
}

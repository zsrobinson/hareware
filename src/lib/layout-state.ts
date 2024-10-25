import { create } from "zustand";
import { DEFAULT_PRESET, type PartialValues } from "./layout-presets";

export type LayoutState = {
  title: {
    content: string;
    size: number;
    color: string;
  };

  author: {
    content: string;
    size: number;
    color: string;
  };

  logo: {
    variant: string;
    size: number;
    filter: string;
    opacity: number;
    position: string;
    xOffset: number;
    yOffset: number;
  };

  background: {
    padding: number;
    color: string;
  };
};

export type MutableLayoutState = LayoutState & {
  title: {
    setContent: (content: string) => void;
    setSize: (size: number) => void;
    setColor: (color: string) => void;
  };

  author: {
    setContent: (content: string) => void;
    setSize: (size: number) => void;
    setColor: (color: string) => void;
  };

  logo: {
    setVariant: (variant: string) => void;
    setSize: (size: number) => void;
    setFilter: (filter: string) => void;
    setOpacity: (opacity: number) => void;
    setPosition: (position: string) => void;
    setXOffset: (xOffset: number) => void;
    setYOffset: (yOffset: number) => void;
  };

  background: {
    setPadding: (padding: number) => void;
    setColor: (color: string) => void;
  };

  setState: (state: PartialValues<LayoutState>) => void;
};

export const useLayoutState = create<MutableLayoutState>()((set) => ({
  title: {
    content: "",
    size: DEFAULT_PRESET.title.size,
    color: DEFAULT_PRESET.title.color,

    setContent: (content) =>
      set((state) => ({ title: { ...state.title, content } })),
    setSize: (size) => set((state) => ({ title: { ...state.title, size } })),
    setColor: (color) => set((state) => ({ title: { ...state.title, color } })),
  },

  author: {
    content: "",
    size: DEFAULT_PRESET.author.size,
    color: DEFAULT_PRESET.author.color,

    setContent: (content) =>
      set((state) => ({ author: { ...state.author, content } })),
    setSize: (size) => set((state) => ({ author: { ...state.author, size } })),
    setColor: (color) =>
      set((state) => ({ author: { ...state.author, color } })),
  },

  logo: {
    variant: DEFAULT_PRESET.logo.variant,
    size: DEFAULT_PRESET.logo.size,
    filter: DEFAULT_PRESET.logo.filter,
    opacity: DEFAULT_PRESET.logo.opacity,
    position: DEFAULT_PRESET.logo.position,
    xOffset: 12,
    yOffset: 12,

    setVariant: (variant) =>
      set((state) => ({ logo: { ...state.logo, variant } })),
    setSize: (size) => set((state) => ({ logo: { ...state.logo, size } })),
    setFilter: (filter) =>
      set((state) => ({ logo: { ...state.logo, filter } })),
    setOpacity: (opacity) =>
      set((state) => ({ logo: { ...state.logo, opacity } })),
    setPosition: (position) =>
      set((state) => ({ logo: { ...state.logo, position } })),
    setXOffset: (xOffset) =>
      set((state) => ({ logo: { ...state.logo, xOffset } })),
    setYOffset: (yOffset) =>
      set((state) => ({ logo: { ...state.logo, yOffset } })),
  },

  background: {
    padding: DEFAULT_PRESET.background.padding,
    color: DEFAULT_PRESET.background.color,

    setPadding: (padding) =>
      set((state) => ({ background: { ...state.background, padding } })),
    setColor: (color) =>
      set((state) => ({ background: { ...state.background, color } })),
  },

  setState: (newState) =>
    set((state) => ({
      title: { ...state.title, ...newState.title },
      author: { ...state.author, ...newState.author },
      logo: { ...state.logo, ...newState.logo },
      background: { ...state.background, ...newState.background },
    })),
}));

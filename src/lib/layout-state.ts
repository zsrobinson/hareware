import { create } from "zustand";
import { presets } from "./color-presets";

const DEFAULTS = {
  ...presets.maroon,
  titleSize: 24,
};

export type LayoutState = {
  textColor: string;
  bgColor: string;

  title: string;
  titleSize: number;

  authorByline: string;
  imageByline: string;
};

export type MutableLayoutState = LayoutState & {
  setTextColor: (textColor: string) => void;
  setBgColor: (bgColor: string) => void;

  setTitle: (title: string) => void;
  setTitleSize: (titleSize: number) => void;

  setAuthorByline: (authorByline: string) => void;
  setImageByline: (imageByline: string) => void;

  reset: () => void;
};

export const useLayoutState = create<MutableLayoutState>()((set) => ({
  ...DEFAULTS,

  /* not part of defaults since shouldn't be reset */
  title: "",
  authorByline: "",
  imageByline: "",

  setTextColor: (textColor) => set({ textColor }),
  setBgColor: (bgColor) => set({ bgColor }),

  setTitle: (title) => set({ title }),
  setTitleSize: (titleSize) => set({ titleSize }),

  setAuthorByline: (authorByline) => set({ authorByline }),
  setImageByline: (imageByline) => set({ imageByline }),

  reset: () => set(DEFAULTS),
}));

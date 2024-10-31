import { create } from "zustand";
import { presets } from "./color-presets";

const DEFAULTS = {
  ...presets.maroon,
  titleSize: 24,
  authorSize: 14,
  logoPosition: "inline",
  logoXOffset: 12,
  logoYOffset: 12,
  logoSize: 48,
};

export type LayoutState = {
  textColor: string;
  bgColor: string;

  titleContent: string;
  titleSize: number;

  authorContent: string;
  authorSize: number;

  logoPosition: string;
  logoXOffset: number;
  logoYOffset: number;
  logoSize: number;
};

export type MutableLayoutState = LayoutState & {
  setTextColor: (textColor: string) => void;
  setBgColor: (bgColor: string) => void;

  setTitleContent: (titleContent: string) => void;
  setTitleSize: (titleSize: number) => void;
  incTitleSize: () => number;
  decTitleSize: () => number;

  setAuthorContent: (authorContent: string) => void;
  setAuthorSize: (authorSize: number) => void;

  setLogoPosition: (logoPosition: string) => void;
  setLogoXOffset: (logoXOffset: number) => void;
  setLogoYOffset: (logoYOffset: number) => void;
  setLogoSize: (logoSize: number) => void;

  reset: () => void;
};

export const useLayoutState = create<MutableLayoutState>()((set, curr) => ({
  ...DEFAULTS,

  /* not part of defaults since shouldn't be reset */
  titleContent: "",
  authorContent: "",

  setTextColor: (textColor: string) => set({ textColor }),
  setBgColor: (bgColor: string) => set({ bgColor }),

  setTitleContent: (titleContent: string) => set({ titleContent }),
  setTitleSize: (titleSize: number) => set({ titleSize }),
  incTitleSize: () => {
    const newSize = curr().titleSize + 1;
    set({ titleSize: newSize });
    return newSize;
  },
  decTitleSize: () => {
    const newSize = curr().titleSize - 1;
    set({ titleSize: newSize });
    return newSize;
  },

  setAuthorContent: (authorContent: string) => set({ authorContent }),
  setAuthorSize: (authorSize: number) => set({ authorSize }),

  setLogoPosition: (logoPosition: string) => set({ logoPosition }),
  setLogoXOffset: (logoXOffset: number) => set({ logoXOffset }),
  setLogoYOffset: (logoYOffset: number) => set({ logoYOffset }),
  setLogoSize: (logoSize: number) => set({ logoSize }),

  reset: () => set(DEFAULTS),
}));

import { create } from "zustand";
import { presets } from "./color-presets";

const DEFAULTS = {
  ...presets.maroon,
  titleSize: 24,
  bylineSize: 14,
  paragraphShift: 0,
  renderImages: true,
};

export type LayoutState = {
  textColor: string;
  bgColor: string;

  title: string;
  titleSize: number;

  articleByline: string;
  imageByline: string;
  bylineSize: number;

  paragraphShift: number;
  renderImages: boolean;
};

export type MutableLayoutState = LayoutState & {
  setTextColor: (textColor: string) => void;
  setBgColor: (bgColor: string) => void;

  setTitle: (title: string) => void;
  setTitleSize: (titleSize: number) => void;
  incTitleSize: () => number;
  decTitleSize: () => number;

  setArticleByline: (articleByline: string) => void;
  setImageByline: (imageByline: string) => void;
  setBylineSize: (bylineSize: number) => void;

  incParagraphShift: () => void;
  setRenderImages: (renderImages: boolean) => void;

  reset: () => void;
};

export const useLayoutState = create<MutableLayoutState>()((set, curr) => ({
  ...DEFAULTS,

  /* not part of defaults since shouldn't be reset */
  title: "",
  articleByline: "",
  imageByline: "",

  setTextColor: (textColor: string) => set({ textColor }),
  setBgColor: (bgColor: string) => set({ bgColor }),

  setTitle: (title: string) => set({ title }),
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

  setArticleByline: (articleByline: string) => set({ articleByline }),
  setImageByline: (imageByline: string) => set({ imageByline }),
  setBylineSize: (bylineSize: number) => set({ bylineSize }),

  incParagraphShift: () => set({ paragraphShift: curr().paragraphShift + 1 }),
  setRenderImages: (renderImages: boolean) => set({ renderImages }),

  reset: () => set(DEFAULTS),
}));

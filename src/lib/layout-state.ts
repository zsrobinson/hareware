import { create } from "zustand";
import { presets } from "./color-presets";

const DEFAULTS = {
  ...presets.maroon,
  ratio: "3/4",
  titleSize: 24,
  bylineSize: 16,
  paragraphShift: 0,
  renderImages: true,
};

export type LayoutState = {
  textColor: string;
  bgColor: string;
  ratio: string;

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
  setRatio: (ratio: string) => void;

  setTitle: (title: string) => void;
  setTitleSize: (titleSize: number) => void;

  setArticleByline: (articleByline: string) => void;
  setImageByline: (imageByline: string) => void;
  setBylineSize: (bylineSize: number) => void;

  incParagraphShift: () => void;
  setRenderImages: (renderImages: boolean) => void;

  clearArticle: () => void;
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
  setRatio: (ratio: string) => set({ ratio }),

  setTitle: (title: string) => set({ title }),
  setTitleSize: (titleSize: number) => set({ titleSize }),

  setArticleByline: (articleByline: string) => set({ articleByline }),
  setImageByline: (imageByline: string) => set({ imageByline }),
  setBylineSize: (bylineSize: number) => set({ bylineSize }),

  incParagraphShift: () => set({ paragraphShift: curr().paragraphShift + 1 }),
  setRenderImages: (renderImages: boolean) => set({ renderImages }),

  /* hands back everything that belongs to one article. this store is a module
     singleton, and client-side navigation keeps the module alive between
     articles, so what isn't given back here follows you to the next one. the
     layout options are deliberately left alone — those are worth keeping */
  clearArticle: () =>
    set({ title: "", articleByline: "", imageByline: "", paragraphShift: 0 }),

  reset: () => set(DEFAULTS),
}));

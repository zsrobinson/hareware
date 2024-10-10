import { z } from "zod";

export const themeValues = ["white", "pink", "maroon"] as const;
export const themeSchema = z.enum(themeValues);
export type Theme = z.infer<typeof themeSchema>;

export const textSizeValues = ["xl", "2xl", "3xl"] as const;
export const textSizeSchema = z.enum(textSizeValues);
export type TextSize = z.infer<typeof textSizeSchema>;

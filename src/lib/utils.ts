import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * a title as a file name: plain lowercase letters and digits joined by
 * hyphens. A browser refuses a download name with characters like a curly
 * apostrophe and saves the file as "download" instead, and titles here are
 * html, so tags and entities come off too
 */
export function slugify(str: string) {
  const slug = str
    .replace(/<[^>]*>/g, "")
    .replace(/&[#\w]+;/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || "article";
}

/** what a caught value says, for a person to read */
export function errorMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

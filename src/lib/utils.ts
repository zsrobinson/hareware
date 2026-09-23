import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(str: string) {
  return str.split(" ").join("-").toLowerCase();
}

/** `"3 contributions"`; `many` for a noun an `s` does not pluralise */
export function plural(count: number, noun: string, many?: string): string {
  return `${count} ${count === 1 ? noun : (many ?? `${noun}s`)}`;
}

/** what a caught value says, for a person to read */
export function errorMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

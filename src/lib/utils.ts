import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(str: string) {
  return str.split(" ").join("-").toLowerCase();
}

/**
 * `"3 contributions"`, `"1 contribution"`.
 *
 * here rather than in any of the three modules that had their own copy — the
 * standing counts, the sync's log line and the kiosk's disambiguation all print
 * the same shape, and a pluralisation rule edited in one of three places is a
 * rule that disagrees with itself
 */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

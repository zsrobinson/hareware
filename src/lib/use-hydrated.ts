import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/**
 * false while hydrating, then true. A page drawn at build time shows its
 * loading line; something already in the shared query client, as after moving
 * between pages, is drawn just after hydration rather than in it, so the two
 * agree
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

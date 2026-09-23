/*
  The routes that need @Editorial Board, read by the nav and the guard alike.
  Imports nothing: middleware reads it, and node builds the prerendered routes.
*/

export const ADMIN_ROUTES = [
  "/attendance",
  "/reconciler",
  "/standing",
  "/automations",
  "/commands",
  "/log",
] as const;

export type AdminRoute = (typeof ADMIN_ROUTES)[number];

/** whether this path is one of the admin tools, and so needs the role */
export function isAdminPath(pathname: string) {
  /* Exact, not a prefix: the tools are flat, so `startsWith` would guard
     `/logout` on its way past. Astro serves `/log/` as `/log`, so the one
     trailing slash it ignores is ignored here too. */
  return (ADMIN_ROUTES as readonly string[]).includes(
    pathname.replace(/\/$/, ""),
  );
}

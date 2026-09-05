/*
  Which routes need @Editorial Board. Every tool sits at the top level, so this
  list is the only thing that says which is which: the nav builds its group
  from it and the guard protects exactly it. `nav.test.ts` holds them together.

  Imports nothing, because middleware reads it and middleware is in the module
  graph of every route, including the prerendered ones node builds itself.
*/

export const ADMIN_ROUTES = ["/automations", "/commands", "/log"] as const;

export type AdminRoute = (typeof ADMIN_ROUTES)[number];

/** whether this path is one of the admin tools, and so needs the role */
export function isAdminPath(pathname: string) {
  /* Exact, not a prefix: the tools are flat, so `startsWith` would guard
     `/logout` on its way past. */
  return (ADMIN_ROUTES as readonly string[]).includes(pathname);
}

/*
  which routes hold the admin tools.

  they used to live under /admin, and the guard was a prefix check. now every
  tool sits at the top level, public and admin alike, because a member reading
  the sidebar has no reason to care which is which — so the prefix is gone and
  this list is what is left of it.

  that makes this the one place the fact lives. the nav builds its Admin tools
  group from it, and the guard protects exactly what is in it, so a route
  cannot be in the sidebar without being guarded. `nav.test.ts` holds the two
  to each other.

  nothing is imported here on purpose. `~/lib/admin-guard` reads it, middleware
  reads the guard, and middleware is in the module graph of every route —
  including the prerendered ones node builds for itself
*/

export const ADMIN_ROUTES = ["/automations", "/commands", "/log"] as const;

export type AdminRoute = (typeof ADMIN_ROUTES)[number];

/** whether this path is one of the admin tools, and so needs the role */
export function isAdminPath(pathname: string) {
  /*
    an exact match, not a prefix. the admin tools are flat and share the top
    level with the public ones, so `startsWith` here would guard `/logout` on
    its way past — a public route answering 401 because it begins with a word
  */
  return (ADMIN_ROUTES as readonly string[]).includes(pathname);
}

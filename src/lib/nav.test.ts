import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "vitest";
import { ADMIN_ROUTES, isAdminPath } from "./admin-routes";
import { adminNav, isActive, toolsNav } from "./nav";

/*
  the admin tools sit at the top level beside the public ones, so nothing about
  a url says which is which any more. `~/lib/admin-routes` is what says it, and
  these hold the three lists that have to agree to it: the nav a member clicks,
  the guard, and the pages on disk.

  the prefix used to do this on its own — anything under /admin was guarded by
  being there. this is what replaces it, and it is why the list is worth having
  as its own module rather than as a field on the nav
*/

test("every admin tool in the sidebar is one the guard protects", () => {
  for (const item of adminNav) {
    expect(isAdminPath(item.href)).toBe(true);
  }
});

test("every guarded route is a tool somebody can reach from the sidebar", () => {
  /* the other direction: a route guarded but not listed is one nobody can
     find, which is the old 404 by another route */
  expect([...ADMIN_ROUTES].sort()).toEqual(
    adminNav.map((item) => item.href).sort(),
  );
});

test("every guarded route has a page to render", () => {
  const pages = readdirSync(new URL("../pages", import.meta.url))
    .filter((name) => name.endsWith(".astro"))
    .map((name) => `/${name.replace(/\.astro$/, "")}`);

  for (const route of ADMIN_ROUTES) {
    expect(pages).toContain(route);
  }
});

/*
  the guard refuses whoever may not be here, but it is `admitted()` that turns
  a missing admission into a fault somebody sees. a page that skips it renders
  for anybody the guard let through and, if the route were ever dropped from
  ADMIN_ROUTES, for everybody — quietly, which is the one outcome this whole
  change exists to rule out.

  AGENTS.md says a page added and forgotten fails loudly. this is what makes
  that true rather than merely hoped for
*/
test("every admin page asks the guard who it is rendering for", () => {
  for (const route of ADMIN_ROUTES) {
    const source = readFileSync(
      new URL(`../pages${route}.astro`, import.meta.url),
      "utf8",
    );

    expect(source).toContain("admitted(Astro.locals)");
  }
});

test("no public tool is sitting on a guarded route", () => {
  for (const item of toolsNav) {
    expect(isAdminPath(item.href)).toBe(false);
  }
});

/*
  the guard matches exactly, so a public route is safe from being caught by a
  guarded one that happens to start the same way
*/
test("guards the route itself, not everything beginning with it", () => {
  expect(isAdminPath("/log")).toBe(true);
  expect(isAdminPath("/logout")).toBe(false);
  expect(isAdminPath("/log/2026")).toBe(false);
  expect(isAdminPath("/generate")).toBe(false);
});

test("lights the nav item for the page being looked at", () => {
  const generate = toolsNav.find((item) => item.href === "/generate")!;

  expect(isActive("/generate", generate)).toBe(true);
  /* the generator's other working page belongs to the same item */
  expect(isActive("/custom", generate)).toBe(true);
  expect(isActive("/words", generate)).toBe(false);
});

test("the log comes last, after the tools somebody came to use", () => {
  expect(adminNav.at(-1)?.href).toBe("/log");
});

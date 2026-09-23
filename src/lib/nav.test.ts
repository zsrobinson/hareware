import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "vitest";
import { ADMIN_ROUTES, isAdminPath } from "./admin-routes";
import { adminNav, isActive, toolsNav } from "./nav";

/*
  Nothing about a url says which tools need the role, so `ADMIN_ROUTES` says it
  and three things have to agree with it: the nav a member clicks, the guard,
  and the pages on disk.
*/

test("the sidebar's admin tools are exactly the guarded routes", () => {
  /* a tool listed but unguarded is open to anyone, and a route guarded but not
     listed is one nobody can find */
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
  `admitted()` is what turns a missing admission into a fault somebody sees, so
  a page that skips it would serve quietly if its route ever fell off
  ADMIN_ROUTES. AGENTS.md promises that fails loudly; this is why it does.
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
  guarded one that happens to start the same way — but Astro also routes the
  trailing-slash form to the page, so the guard has to catch that one too
*/
test("guards the route itself, not everything beginning with it", () => {
  expect(isAdminPath("/log")).toBe(true);
  expect(isAdminPath("/log/")).toBe(true);
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

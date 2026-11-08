import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "vitest";
import { ADMIN_ROUTES } from "./admin-routes";
import { adminNav, isActive, pagePath, toolsNav } from "./nav";

/*
  Nothing about a url says which tools need the role, so `ADMIN_ROUTES` says it
  and the nav a member clicks and the pages on disk have to agree with it.
*/

test("the sidebar's admin tools are exactly the board's routes", () => {
  /* a route on the list but not in the sidebar is one nobody can find */
  expect([...ADMIN_ROUTES].sort()).toEqual(
    adminNav.map((item) => item.href).sort(),
  );
});

test("every one of the board's routes has a page", () => {
  const pages = readdirSync(new URL("../pages", import.meta.url))
    .filter((name) => name.endsWith(".astro"))
    .map((name) => `/${name.replace(/\.astro$/, "")}`);

  for (const route of ADMIN_ROUTES) {
    expect(pages).toContain(route);
  }
});

/*
  The admin pages are static shells and the gate is on the APIs (ADR 0012), so
  what has to hold is that a shell carries nothing private: it is prerendered,
  reads nothing on the server, and gets its data from an API that asks
  `adminAccess` before answering.
*/
/* only /api and /auth reach the Worker (wrangler.jsonc's run_worker_first);
   a page that is not prerendered works under `astro dev` and is the 404 page
   in production */
test("every page is a static file", () => {
  const pages = (dir: string): string[] =>
    readdirSync(new URL(`../pages/${dir}`, import.meta.url), {
      withFileTypes: true,
    }).flatMap((entry) =>
      entry.isDirectory()
        ? pages(`${dir}${entry.name}/`)
        : entry.name.endsWith(".astro")
          ? [`${dir}${entry.name}`]
          : [],
    );
  for (const page of pages("")) {
    const source = readFileSync(
      new URL(`../pages/${page}`, import.meta.url),
      "utf8",
    );
    expect(source, page).toContain("export const prerender = true");
  }
});

test("every admin page is a static shell that reads nothing on the server", () => {
  for (const route of ADMIN_ROUTES) {
    const source = readFileSync(
      new URL(`../pages${route}.astro`, import.meta.url),
      "utf8",
    );

    expect(source).toContain("export const prerender = true");
    for (const server of ["cloudflare:workers", "~/lib/admin", "Astro.request"])
      expect(source).not.toContain(server);
  }
});

test("every API that hands out board data asks the gate first", () => {
  const gated = [
    "api/archive.json.ts",
    "api/reminder.json.ts",
    "api/sheet.ts",
    "api/access.json.ts",
    "api/automations/run.ts",
  ];
  for (const file of gated) {
    const source = readFileSync(
      new URL(`../pages/${file}`, import.meta.url),
      "utf8",
    );
    expect(source, file).toContain("adminAccess(request)");
  }

  /* and no other api route quietly reads the Sheet or the log */
  const all = (dir: string): string[] =>
    readdirSync(new URL(`../pages/${dir}`, import.meta.url), {
      withFileTypes: true,
    }).flatMap((entry) =>
      entry.isDirectory()
        ? all(`${dir}/${entry.name}`)
        : [`${dir}/${entry.name}`],
    );
  for (const file of all("api").filter((f) => !f.endsWith(".test.ts"))) {
    const source = readFileSync(
      new URL(`../pages/${file}`, import.meta.url),
      "utf8",
    );
    const private_ =
      /loadSheet|sheetsClient|readSheet|services\/google|reminderView|faces|recent\(|env\.DB/.test(
        source,
      );
    /* Discord signs every interaction; it writes the log and answers Discord,
       and hands nothing from the Sheet or the log back to anyone */
    const signed = file === "api/discord/interactions.ts";
    if (private_ && !signed) expect(gated, file).toContain(file);
  }
});

test("no public tool is listed among the board's", () => {
  for (const item of toolsNav)
    expect(ADMIN_ROUTES as readonly string[]).not.toContain(item.href);
});

test("lights the nav item for the page being looked at", () => {
  const generate = toolsNav.find((item) => item.href === "/generate")!;

  expect(isActive("/generate", generate)).toBe(true);
  /* the generator's other working page belongs to the same item */
  expect(isActive("/custom", generate)).toBe(true);
  expect(isActive("/words", generate)).toBe(false);
});

/* every page is prerendered, and the build names each one by its file */
test("lights the item for a page built as a file", () => {
  const people = adminNav.find((item) => item.href === "/people")!;

  expect(isActive(pagePath("/people.html"), people)).toBe(true);
  expect(pagePath("/index.html")).toBe("/");
  expect(pagePath("/people")).toBe("/people");
});

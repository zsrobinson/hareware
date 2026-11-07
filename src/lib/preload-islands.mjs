// @ts-check
/*
  Every page's JavaScript, asked for at once. An island's chunk names the
  chunks it needs only once it has arrived, so a page fetched them one after
  another: the island, then the shared code it imports, then what that
  imports. On a direct link to the slides that chain finished after the
  article did (ADR 0012). After the build, this lists each page's islands and
  scripts, follows their static imports, and puts a modulepreload for each in
  the page's head, so they all start with the HTML.

  Only static imports are followed: a dynamic one is code a page might never
  run.
*/

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* where a page names its JavaScript */
const ENTRIES =
  /(?:component-url|renderer-url|before-hydration-url)="([^"]+\.js)"|<script type="module" src="([^"]+\.js)"/g;
/* a minified static import: `import{a as b}from"./x.js"` or `import"./x.js"` */
const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*"(\.\/[^"]+\.js)"/g;

/** @param {string} dir */
async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/**
 * every chunk `url` needs before it can run, itself included
 * @param {string} root the client build directory
 * @param {string} url a site path such as /_astro/x.js
 * @param {Map<string, string[]>} known chunk path to its static imports
 * @param {Set<string>} into
 */
async function graph(root, url, known, into) {
  if (into.has(url)) return;
  into.add(url);
  let imports = known.get(url);
  if (!imports) {
    const source = await readFile(path.join(root, url), "utf8").catch(() => "");
    imports = [...source.matchAll(STATIC_IMPORT)].map(([, relative]) =>
      path.posix.join(path.posix.dirname(url), relative),
    );
    known.set(url, imports);
  }
  for (const next of imports) await graph(root, next, known, into);
}

/** @returns {import("astro").AstroIntegration} */
export function preloadIslands() {
  return {
    name: "preload-islands",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        /** @type {Map<string, string[]>} */
        const known = new Map();
        let pages = 0;
        for (const file of await htmlFiles(root)) {
          const html = await readFile(file, "utf8");
          if (!html.includes("</head>")) continue;
          /** @type {Set<string>} */
          const needed = new Set();
          for (const [, island, script] of html.matchAll(ENTRIES)) {
            const url = island ?? script;
            if (url?.startsWith("/")) await graph(root, url, known, needed);
          }
          /* a script tag already fetches itself; its imports still benefit */
          for (const [, , script] of html.matchAll(ENTRIES))
            if (script) needed.delete(script);
          if (needed.size === 0) continue;
          const links = [...needed]
            .map((url) => `<link rel="modulepreload" href="${url}">`)
            .join("");
          await writeFile(file, html.replace("</head>", `${links}</head>`));
          pages++;
        }
        logger.info(`modulepreload added to ${pages} pages`);
      },
    },
  };
}

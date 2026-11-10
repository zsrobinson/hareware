// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";

import tailwindcss from "@tailwindcss/vite";
import { version } from "./src/lib/build-version.mjs";
import { preloadIslands } from "./src/lib/preload-islands.mjs";

// https://astro.build/config
export default defineConfig({
  output: "server",
  // HareWare signs its own stateless session cookie; ADR 0008 deliberately
  // has no server-side session store.
  session: false,
  integrations: [react(), preloadIslands()],

  // these become _redirects rules, which the asset server answers with a 301
  // and without the Worker. the front door is the tool people came for. the
  // old admin urls are in Discord messages the bot has already posted, and
  // one of them is what an alert tells somebody to go and read; the reminder,
  // its log and its commands are all one page now
  redirects: {
    "/": "/generate",
    "/admin": "/reminder",
    "/admin/automations": "/reminder",
    "/admin/commands": "/reminder",
    "/admin/log": "/reminder",
    "/automations": "/reminder",
    "/commands": "/reminder",
    "/log": "/reminder",
  },

  // `/generate` is served as generate.html; the default, generate/index.html,
  // would have the asset server redirect every visit to `/generate/`
  build: { format: "file" },

  adapter: cloudflare({
    // nothing here goes through astro:assets — every image is already a
    // wordpress.com url that image-url.ts sizes with a query parameter. the
    // default binding would provision cloudflare images to transform pictures
    // we never hand it
    imageService: "passthrough",

    // workerd needs a 48-bit virtual address space and the raspberry pi's
    // 39-bit kernel cannot give it one, so prerendering in workerd aborts
    // before it starts. node renders every page identically: they are static
    // shells with no runtime-specific code in them (ADR 0012)
    prerenderEnvironment: "node",
  }),

  // opt-in rather than prefetchAll: a link marked data-astro-prefetch has its
  // page fetched on hover. the pages are static shells, so that reads nothing
  // from WordPress; Instagram Posts reads the article itself on hover
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },

  vite: {
    plugins: [tailwindcss()],

    /* baked in at build time: there is no git repository at runtime, and the
       worker has no way to ask what it was built from */
    define: { __APP_VERSION__: JSON.stringify(version()) },

    /*
      the browser's code in a few chunks rather than sixty. every page is a
      static shell whose island asks WordPress itself (ADR 0012), and each
      chunk an island imports is another round trip before it can draw: split
      finely, the slides waited about a second behind the chain of imports.
      ~/lib/preload-islands now asks for them all with the HTML, and this
      keeps that to about a dozen files. the Worker's own bundle is left as
      it is
    */
    environments: {
      client: {
        build: {
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [
                  /* only the archive's tables use it */
                  {
                    name: "table",
                    test: /node_modules[\\/]@tanstack[\\/](react-)?table/,
                  },
                  /* every library but those two: modern-screenshot is
                     imported only when slides are saved, and a group here
                     would load it with every page */
                  {
                    name: "vendor",
                    test: /node_modules[\\/](?!modern-screenshot|@tanstack[\\/](react-)?table)/,
                  },
                  {
                    name: "shared",
                    test: /src[\\/](lib|components[\\/]ui)[\\/]/,
                  },
                ],
              },
            },
          },
        },
      },
    },

    /*
      both of these are pulled in by astro at request time rather than at boot,
      so vite's ssr optimizer discovers them once the first request arrives,
      re-bundles, and reloads the program underneath the running workerd — which
      then reaches for a chunk hash that no longer exists and the dev server
      dies before it ever serves a page. naming them up front means the optimizer
      finishes before the worker starts and never has to reload

      `noop` is the image service `imageService: "passthrough"` selects. drop
      these only after checking a cold `rm -rf node_modules/.vite && astro dev`
      still logs no "dependency optimized" line
    */
    ssr: {
      optimizeDeps: {
        include: ["astro/assets/services/noop", "astro/app/manifest"],
      },
    },
  },
});

// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";

import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";

/**
 * what is deployed, as a string a person can act on.
 *
 * `git describe` gives the nearest tag plus how far past it we are, falling
 * back to a bare short hash before the first tag exists. the build runs in a
 * real clone on Workers Builds, so this works there too — and if it ever does
 * not, the env var Workers CI sets is the backstop and "unknown" is the floor.
 * a version nobody can read is worse than one that admits it does not know
 */
function version() {
  try {
    return execFileSync("git", ["describe", "--tags", "--always", "--dirty"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ?? "unknown";
  }
}

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react()],

  adapter: cloudflare({
    // nothing here goes through astro:assets — every image is already a
    // wordpress.com url that image-url.ts sizes with a query parameter. the
    // default binding would provision cloudflare images to transform pictures
    // we never hand it
    imageService: "passthrough",

    // workerd needs a 48-bit virtual address space and the raspberry pi's
    // 39-bit kernel cannot give it one, so prerendering /custom in workerd
    // aborts before it starts. node renders the one prerendered route we have
    // identically — it is static markup with no runtime-specific code in it
    prerenderEnvironment: "node",
  }),

  // opt-in rather than prefetchAll: /generate and /magazine must always read
  // the article live, so only links that don't hit wordpress get prefetched
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },

  vite: {
    plugins: [tailwindcss()],

    /* baked in at build time: there is no git repository at runtime, and the
       worker has no way to ask what it was built from */
    define: { __APP_VERSION__: JSON.stringify(version()) },

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

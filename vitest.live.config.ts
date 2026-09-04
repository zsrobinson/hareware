import { defineConfig } from "vitest/config";

/*
  the opposite of vitest.config.ts: this runs only the files that talk to the
  real notion, the real wordpress feed and a real discord channel, using the
  secrets in .dev.vars. it posts messages, so it is never part of `npm test`
*/
export default defineConfig({
  resolve: { alias: { "~": new URL("./src/", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["src/**/*.live.test.ts"],
    testTimeout: 30000,
  },
});

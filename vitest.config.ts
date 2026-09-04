import { defineConfig } from "vitest/config";

/*
  unit tests only: everything here runs from a fresh clone with no secrets, no
  network and no notion. the live sender that actually posts to discord is
  opt-in through vitest.live.config.ts — see `npm run reminders:send`
*/
export default defineConfig({
  resolve: { alias: { "~": new URL("./src/", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.live.test.ts"],
  },
});

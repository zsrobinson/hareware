import { defineConfig } from "drizzle-kit";

/*
  migrations are generated from src/lib/db/schema.ts and applied with
  `npx wrangler d1 migrations apply hareware --remote`, so the schema and the
  types it produces come from one place
*/
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/lib/db/schema.ts",
  out: "./migrations",
});

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./packages/api/src/schema.ts",
  dialect: "sqlite",
});

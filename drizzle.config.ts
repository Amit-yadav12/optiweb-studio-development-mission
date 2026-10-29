import { defineConfig } from "drizzle-kit";

/**
 * Connection string comes from the environment so no credentials are committed.
 * Falls back to the local development database.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __optiwebPool?: Pool;
};

/**
 * Reuse one pool across hot reloads *and* serverless invocations on the same
 * isolate. Creating a new Pool per request exhausts Postgres `max_connections`
 * under even modest concurrency.
 */
const poolMax = Number(process.env.OW_PG_POOL_MAX);
export const pool =
  globalForDb.__optiwebPool ??
  new Pool({
    connectionString: databaseUrl,
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    // Bound a runaway query so a stuck SELECT cannot hold a worker until the
    // platform kills it.
    statement_timeout: 15_000,
  });

globalForDb.__optiwebPool = pool;

export const db = drizzle(pool);

import sharp from "sharp";
import { APP_NAME } from "@/server/config/env";
import { jsonOk, route } from "@/server/http/handler";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { HealthStatus } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/health — real dependency probes, not a static string. */
export const GET = route(async (_req, ctx) => {
  const started = Date.now();
  let connected = true;
  let error: string | undefined;
  try {
    await db.execute(sql`select 1`);
  } catch (dbError) {
    connected = false;
    error = dbError instanceof Error ? dbError.message : "unreachable";
  }

  let sharpVersion: string | undefined;
  try {
    sharpVersion = `${sharp.versions.sharp} (libvips ${sharp.versions.vips})`;
  } catch {
    sharpVersion = undefined;
  }

  const body: HealthStatus = {
    ok: connected,
    service: APP_NAME,
    version: process.env.npm_package_version ?? "1.0.0",
    database: { connected, latencyMs: connected ? Date.now() - started : null, error },
    sharp: { available: Boolean(sharpVersion), versions: sharpVersion },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  return jsonOk(body, ctx, { status: 200 });
});

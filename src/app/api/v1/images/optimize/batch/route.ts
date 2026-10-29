import { optimizeUploadedImages } from "@/server/controllers/imagesController";
import { route } from "@/server/http/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/v1/images/optimize/batch
 * Explicit batch alias — identical contract to /images/optimize, which already
 * accepts multiple files. Kept as a versioned, discoverable endpoint.
 */
export const POST = route(optimizeUploadedImages, { bucket: "images/optimize" });

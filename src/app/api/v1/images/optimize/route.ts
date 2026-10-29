import { optimizeUploadedImages } from "@/server/controllers/imagesController";
import { route } from "@/server/http/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/v1/images/optimize — accepts one image or a multipart batch. */
export const POST = route(optimizeUploadedImages, { bucket: "images/optimize" });

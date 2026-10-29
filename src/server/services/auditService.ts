/**
 * Website performance audit — HTML fetch + asset discovery.
 *
 * This is a *document-level lab measurement*, not a Chrome session and not
 * CrUX field data. JavaScript-inserted resources are not observed. When
 * PAGESPEED_API_KEY is set, PageSpeed Insights (lab + field) is attached and
 * labelled as such. Missing field data is reported as unavailable, never filled in.
 */
import { parse as parseHtml } from "node-html-parser";
import { limits } from "@/server/config/env";
import { badRequest, unprocessable } from "@/server/http/errors";
import { assertPublicHostname, parseHttpUrl, validateAuditUrl } from "@/server/security/ssrf";
import { sniffImage } from "@/server/services/imageService";
import { analyzeCss } from "@/server/services/cssService";

export type EvidenceKind = "measured" | "estimated" | "unavailable" | "not-applicable";

export type AuditResource = {
  url: string;
  kind: "document" | "image" | "stylesheet" | "font" | "script" | "other";
  origin: "document-html" | "stylesheet";
  status: number | null;
  contentType: string | null;
  transferredBytes: number | null;
  width: number | null;
  height: number | null;
  skipped?: string;
  finding?: string;
};

export type AuditFinding = {
  id: string;
  severity: "info" | "warning" | "issue";
  title: string;
  evidence: string;
  action: string;
  heuristic: boolean;
};

export type AuditReport = {
  url: string;
  fetchedUrl: string;
  startedAt: string;
  durationMs: number;
  coverage: {
    mode: "single-document";
    javascriptRendered: false;
    note: string;
  };
  document: {
    status: number;
    contentType: string | null;
    bytes: number;
    title: string | null;
  };
  resources: AuditResource[];
  totals: {
    requestsAttempted: number;
    requestsOk: number;
    transferredBytes: number;
    imageBytes: number;
    fontBytes: number;
    cssBytes: number;
    scriptBytes: number;
  };
  findings: AuditFinding[];
  pagespeed: {
    configured: boolean;
    lab: Record<string, { value: number | string | null; source: string; kind: EvidenceKind }> | null;
    field: Record<string, { value: number | string | null; source: string; kind: EvidenceKind }> | null;
    error?: string;
  };
};

const UA = "OptiWebStudio-Audit/1.0 (+https://optiweb.studio; lab document fetch)";

async function fetchPublic(url: URL, maxBytes: number): Promise<{ status: number; contentType: string | null; body: Buffer; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop <= 3; hop += 1) {
    await assertPublicHostname(current.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.auditTimeoutMs);
    let response: Response;
    try {
      response = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "*/*", "user-agent": UA },
      });
    } catch (error) {
      clearTimeout(timer);
      const aborted = error instanceof Error && error.name === "AbortError";
      throw unprocessable(aborted ? "The remote host did not respond in time." : "The remote host could not be reached.");
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw unprocessable("The remote host returned a redirect without a Location header.");
      current = new URL(location, current);
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw badRequest("Redirected to a non-http URL.");
      }
      continue;
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw unprocessable(`The response is larger than the ${(maxBytes / 1024).toFixed(0)} KB audit limit.`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > maxBytes) {
      throw unprocessable(`The response is larger than the ${(maxBytes / 1024).toFixed(0)} KB audit limit.`);
    }
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      body,
      finalUrl: current.href,
    };
  }
  throw unprocessable("Too many redirects.");
}

function abs(from: URL, href: string | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:") || trimmed.startsWith("#")) return null;
  try {
    return new URL(trimmed, from).href;
  } catch {
    return null;
  }
}

function classify(url: string, contentType: string | null): AuditResource["kind"] {
  const path = url.toLowerCase();
  const type = (contentType ?? "").toLowerCase();
  if (type.startsWith("image/") || /\.(avif|gif|jpe?g|png|svg|webp|ico)(\?|$)/.test(path)) return "image";
  if (type.includes("css") || path.endsWith(".css")) return "stylesheet";
  if (type.includes("font") || /\.(woff2?|ttf|otf|eot)(\?|$)/.test(path)) return "font";
  if (type.includes("javascript") || /\.m?js(\?|$)/.test(path)) return "script";
  return "other";
}

async function pagespeed(url: string) {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) {
    return {
      configured: false,
      lab: null,
      field: null,
      error: "PAGESPEED_API_KEY is not set. Lab Core Web Vitals from Lighthouse and CrUX field data are unavailable.",
    };
  }
  try {
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("strategy", "mobile");
    endpoint.searchParams.set("key", key);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      return { configured: true, lab: null, field: null, error: `PageSpeed Insights returned HTTP ${response.status}.` };
    }
    const json = (await response.json()) as {
      lighthouseResult?: { audits?: Record<string, { numericValue?: number; displayValue?: string }> };
      loadingExperience?: { metrics?: Record<string, { percentile?: number; category?: string }> };
    };
    const audits = json.lighthouseResult?.audits ?? {};
    const lab = {
      lcp: { value: audits["largest-contentful-paint"]?.numericValue ?? null, source: "PageSpeed Insights Lighthouse (lab)", kind: "measured" as EvidenceKind },
      cls: { value: audits["cumulative-layout-shift"]?.numericValue ?? null, source: "PageSpeed Insights Lighthouse (lab)", kind: "measured" as EvidenceKind },
      tbt: { value: audits["total-blocking-time"]?.numericValue ?? null, source: "PageSpeed Insights Lighthouse (lab)", kind: "measured" as EvidenceKind },
    };
    const fieldMetrics = json.loadingExperience?.metrics;
    const field = fieldMetrics
      ? {
          lcp: { value: fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null, source: "Chrome UX Report via PSI (field)", kind: "measured" as EvidenceKind },
          cls: { value: fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? null, source: "Chrome UX Report via PSI (field)", kind: "measured" as EvidenceKind },
          inp: { value: fieldMetrics.INTERACTION_TO_NEXT_PAINT?.percentile ?? null, source: "Chrome UX Report via PSI (field)", kind: "measured" as EvidenceKind },
        }
      : null;
    return {
      configured: true,
      lab,
      field: field ?? {
        lcp: { value: null, source: "Chrome UX Report", kind: "unavailable" as EvidenceKind },
      },
      error: field ? undefined : "CrUX has insufficient real-user data for this URL.",
    };
  } catch (error) {
    return {
      configured: true,
      lab: null,
      field: null,
      error: error instanceof Error ? error.message : "PageSpeed Insights request failed.",
    };
  }
}

export async function runWebsiteAudit(rawUrl: string): Promise<AuditReport> {
  const started = Date.now();
  const url = await validateAuditUrl(rawUrl);
  const document = await fetchPublic(url, limits.auditMaxHtmlBytes);
  if (document.status >= 400) {
    throw unprocessable(`The page returned HTTP ${document.status}.`);
  }

  const html = document.body.toString("utf8");
  const root = parseHtml(html);
  const title = root.querySelector("title")?.text?.trim() || null;
  const discovered = new Set<string>();

  const pushUrl = (href: string | null) => {
    if (!href) return;
    try {
      const resolved = new URL(href);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;
      discovered.add(resolved.href);
    } catch {
      /* ignore */
    }
  };

  for (const img of root.querySelectorAll("img")) {
    pushUrl(abs(url, img.getAttribute("src")));
    const srcset = img.getAttribute("srcset") ?? "";
    for (const part of srcset.split(",")) pushUrl(abs(url, part.trim().split(/\s+/)[0]));
  }
  for (const source of root.querySelectorAll("source")) {
    pushUrl(abs(url, source.getAttribute("src")));
    const srcset = source.getAttribute("srcset") ?? "";
    for (const part of srcset.split(",")) pushUrl(abs(url, part.trim().split(/\s+/)[0]));
  }
  for (const link of root.querySelectorAll("link")) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase();
    if (rel.includes("stylesheet") || rel.includes("preload") || rel.includes("icon")) {
      pushUrl(abs(url, link.getAttribute("href")));
    }
  }
  for (const script of root.querySelectorAll("script[src]")) {
    pushUrl(abs(url, script.getAttribute("src")));
  }

  const resources: AuditResource[] = [
    {
      url: document.finalUrl,
      kind: "document",
      origin: "document-html",
      status: document.status,
      contentType: document.contentType,
      transferredBytes: document.body.byteLength,
      width: null,
      height: null,
    },
  ];

  const findings: AuditFinding[] = [];
  const queue = [...discovered].slice(0, limits.auditMaxResources);

  for (const href of queue) {
    let parsed: URL;
    try {
      parsed = parseHttpUrl(href);
    } catch {
      resources.push({
        url: href,
        kind: "other",
        origin: "document-html",
        status: null,
        contentType: null,
        transferredBytes: null,
        width: null,
        height: null,
        skipped: "invalid URL",
      });
      continue;
    }
    try {
      const fetched = await fetchPublic(parsed, limits.auditMaxResourceBytes);
      const kind = classify(fetched.finalUrl, fetched.contentType);
      let width: number | null = null;
      let height: number | null = null;
      let finding: string | undefined;
      if (kind === "image") {
        try {
          const sniffed = await sniffImage(fetched.body);
          width = sniffed.width;
          height = sniffed.height;
          if (fetched.body.byteLength > 300 * 1024) {
            finding = `Image is ${(fetched.body.byteLength / 1024).toFixed(0)} KB. Test a WebP/AVIF conversion in the Image Optimizer.`;
          }
        } catch {
          finding = "Image bytes could not be decoded.";
        }
      }
      if (kind === "stylesheet") {
        try {
          const analysis = analyzeCss(fetched.body.toString("utf8"), "swap");
          if (analysis.missingFontDisplay > 0) {
            finding = `${analysis.missingFontDisplay} of ${analysis.fontFaceCount} @font-face rules lack font-display.`;
          }
        } catch {
          finding = "Stylesheet could not be parsed.";
        }
      }
      resources.push({
        url: fetched.finalUrl,
        kind,
        origin: "document-html",
        status: fetched.status,
        contentType: fetched.contentType,
        transferredBytes: fetched.body.byteLength,
        width,
        height,
        finding,
      });
      if (finding) {
        findings.push({
          id: crypto.randomUUID(),
          severity: kind === "image" ? "warning" : "info",
          title: finding,
          evidence: `${fetched.finalUrl} · ${fetched.body.byteLength} bytes · HTTP ${fetched.status}`,
          action:
            kind === "image"
              ? "Download the image and run it through the Image Optimizer, or re-export at the displayed size."
              : "Open the Font Optimizer with this stylesheet.",
          heuristic: kind === "image",
        });
      }
    } catch (error) {
      resources.push({
        url: href,
        kind: classify(href, null),
        origin: "document-html",
        status: null,
        contentType: null,
        transferredBytes: null,
        width: null,
        height: null,
        skipped: error instanceof Error ? error.message : "fetch failed",
      });
    }
  }

  const ok = resources.filter((r) => r.status && r.status < 400);
  const transferred = ok.reduce((sum, r) => sum + (r.transferredBytes ?? 0), 0);
  const psi = await pagespeed(document.finalUrl);

  findings.unshift({
    id: "coverage",
    severity: "info",
    title: "This is a document-level lab fetch, not a browser session.",
    evidence: `HTML parsed for ${queue.length} discoverable URLs. JavaScript-inserted resources are not observed.`,
    action: "Treat Core Web Vitals as unavailable unless PageSpeed Insights is configured.",
    heuristic: false,
  });

  return {
    url: url.href,
    fetchedUrl: document.finalUrl,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    coverage: {
      mode: "single-document",
      javascriptRendered: false,
      note: "Assets listed in the initial HTML and same-document srcset/src/href. No headless Chrome, so client-rendered resources are out of scope.",
    },
    document: {
      status: document.status,
      contentType: document.contentType,
      bytes: document.body.byteLength,
      title,
    },
    resources,
    totals: {
      requestsAttempted: resources.length,
      requestsOk: ok.length,
      transferredBytes: transferred,
      imageBytes: ok.filter((r) => r.kind === "image").reduce((s, r) => s + (r.transferredBytes ?? 0), 0),
      fontBytes: ok.filter((r) => r.kind === "font").reduce((s, r) => s + (r.transferredBytes ?? 0), 0),
      cssBytes: ok.filter((r) => r.kind === "stylesheet").reduce((s, r) => s + (r.transferredBytes ?? 0), 0),
      scriptBytes: ok.filter((r) => r.kind === "script").reduce((s, r) => s + (r.transferredBytes ?? 0), 0),
    },
    findings,
    pagespeed: psi,
  };
}

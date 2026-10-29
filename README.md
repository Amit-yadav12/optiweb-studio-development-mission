# OptiWeb Studio

**Make every byte count.** A developer workspace for static asset performance: convert and
compress images, audit CSS `font-display` rules, and measure real byte savings in one coherent
workflow.

## What it does

| Tool | What it really does |
| --- | --- |
| **Image Optimizer** | Re-encodes uploads with [sharp](https://sharp.pixelplumbing.com) to WebP / AVIF / JPEG / PNG, optionally caps dimensions (aspect ratio preserved), and reports measured input/output sizes, savings and per-file status. Batches of up to 8 files, partial failures handled per file, ZIP export. |
| **Font Optimizer** | Parses stylesheets with [PostCSS](https://postcss.org), counts `@font-face` rules, finds rules missing `font-display`, and generates a patched stylesheet with a line-level diff. Malformed CSS is reported with a line number and never half-patched. |
| **Asset Analyzer** | Decodes uploaded images for true dimensions and weight, parses stylesheets for font-loading gaps, and reports findings with evidence. Heuristic findings (threshold-based) are labelled as such. |
| **History** | Session-scoped job records with per-file metadata and stored artifacts (24 h TTL). Artifacts are the produced bytes — never the uploads. |
| **Settings** | Session-persisted defaults (format, quality, max width, font-display policy, size threshold, motion) and a display of the enforced server limits. |

Every reported metric is computed from the bytes the server actually produced:

```
savings_bytes   = input_bytes − output_bytes
savings_percent = savings_bytes / input_bytes × 100
```

Outputs larger than their source are reported as negative savings. OptiWeb does not claim Core
Web Vitals improvements — asset weight is an input to page performance, not a measurement of it.

## Stack

- **React 19 + TypeScript (strict)** with the App Router — server components for data pages,
  client islands for interactive tools.
- **Node.js HTTP API** (route handlers): zod validation, a versioned JSON envelope, typed error
  codes, per-session rate limiting, session-cookie scoping.
- **PostgreSQL + Drizzle ORM** for job metadata, per-file results, stored artifacts and
  preferences. **Not Express/MongoDB** — the API is Next.js Route Handlers. (The brief preferred
  MERN; this runs on the platform-provided Postgres so history is genuinely persistent rather
  than mocked. Persistence is isolated in `src/server/services/storageService.ts`, so a Mongoose
  port swaps that one file. That port has **not** been done — MongoDB is unverified.)
- **sharp** for image processing, **PostCSS** for CSS, **JSZip** for bundles.

## Getting started

```bash
npm install
cp .env.example .env        # set DATABASE_URL
npx drizzle-kit push        # create tables
npm run dev                 # http://localhost:3000
```

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Production build (also type-checks) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `node scripts/api-selftest.mjs [BASE_URL]` | End-to-end API verification against a running server (71 checks: conversion accuracy, session isolation, validation, rate limiting, pages) |

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `OW_MAX_FILE_MB` | `10` | Per-file upload limit |
| `OW_MAX_BATCH_MB` | `0` (off) | Total upload budget per request — set to `4` on Vercel |
| `OW_MAX_FILES` | `8` | Files per request |
| `OW_IMAGE_TIMEOUT_MS` | `15000` | Per-transform wall clock |
| `OW_IMAGE_CONCURRENCY` | `2` | Parallel sharp transforms |
| `OW_MAX_CSS_CHARS` | `400000` | Stylesheet length cap |
| `OW_ARTIFACT_TTL_HOURS` | `24` | Stored-result retention |

## API

Versioned under `/api/v1`. All responses use one envelope:

```jsonc
{ "ok": true, "data": { … }, "meta": { "requestId": "…", "rateLimit": { "limit": 20, "remaining": 17 } } }
{ "ok": false, "error": { "code": "validation_error", "message": "…", "hint": "…" }, "meta": { "requestId": "…" } }
```

See [docs/api.md](docs/api.md) for endpoints, [docs/deployment.md](docs/deployment.md) for
production notes.

## Security model

- Uploads are decoded in memory and never executed or written to disk.
- Content is validated by the decoder (sharp/PostCSS), not by client-declared MIME types.
- Output filenames are sanitised; artifact ids are opaque UUIDs, so no user path is ever
  joined into a filesystem path.
- Guest session (httpOnly cookie) scopes history and artifacts; every read/write is
  session-filtered, and cross-session access returns 404.
- Rate limiting per session per endpoint; body/row-count limits; per-transform timeout;
  bounded concurrency.
- Logs carry request ids and error classes only — never file contents or full paths.

## Theming

Light and dark palettes are token-driven (`src/app/globals.css`). Dark mode resolves from the
OS `prefers-color-scheme`, can be pinned per browser via the header toggle
(system → light → dark), and persists in `localStorage` under `ow-theme`. An inline bootstrap
script applies the resolved theme before first paint, so there is no flash of the wrong palette.
Every dark-mode text pair was checked for WCAG AA 4.5:1 — see the table in
`docs/design-tokens.md`.

**Vercel note:** Vercel caps the whole Serverless Function request body at ~4.5 MB and it cannot
be raised. Defaults allow far more, so set `OW_MAX_FILE_MB=1`, `OW_MAX_FILES=4`,
`OW_MAX_BATCH_MB=4` there. Details in [docs/deployment.md](docs/deployment.md).

## Known limitations

- History is session-scoped (no accounts — deliberate for an MVP of this scope).
- Artifacts expire after 24 hours; re-run a job to recover a download.
- The analyzer inspects individual files, not a rendered page — it cannot know display size or
  traffic.
- Rate-limit state is in-process; a multi-instance deployment needs a shared store.

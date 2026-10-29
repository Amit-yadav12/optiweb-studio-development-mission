# OptiWeb Studio — deployment notes

## Stack reality (read this first)

This application is **Next.js (App Router) + PostgreSQL/Drizzle**, not Express + MongoDB:

| Layer | Actual implementation | Where it lives |
| --- | --- | --- |
| HTTP API | Next.js Route Handlers (`export const runtime = "nodejs"`), versioned under `/api/v1` | `src/app/api/v1/**` |
| Middleware chain | Session resolution → rate limiting → controller → centralised error mapping | `src/server/http/handler.ts` |
| Controllers / services / validators | Mirrors an Express layering | `src/server/{controllers,services,validators}` |
| Persistence | PostgreSQL via Drizzle ORM | `src/server/services/storageService.ts`, `src/db/schema.ts` |

The persistence layer is deliberately isolated in `storageService.ts` (one file, ~12 query
functions). Porting to MongoDB Atlas + Mongoose means rewriting that file and `src/db/schema.ts`;
the REST contract and the UI do not change. **This port has not been performed** — MongoDB
connectivity is therefore **unverified**.

## Hosting targets

### Vercel — works, with one hard constraint

Next.js App Router and sharp run on Vercel's Node.js runtime without extra configuration.
Artifacts are stored in PostgreSQL, not on the filesystem, so functions stay stateless and
survive cold starts.

**⚠️ Request-body limit (verified against Vercel documentation):** Vercel caps the *entire*
request body of a Serverless Function at **~4.5 MB**, enforced at the infrastructure level.
It **cannot** be raised via `vercel.json` or application code, and it counts all files in a
multipart batch plus the boundary and form fields.

The application defaults (`OW_MAX_FILE_MB=10`, `OW_MAX_FILES=8`) allow up to ~80 MB of bodies,
so on Vercel larger batches fail with a platform `413` **before reaching this code**.

To stay inside the budget, set:

```bash
OW_MAX_FILE_MB=1          # per file
OW_MAX_FILES=4            # ⇒ ≈4 MB of bodies, leaving headroom for the multipart overhead
OW_MAX_BATCH_MB=4         # enforce the total in-app so users get our message, not the edge's
OW_MAX_ZIP_MB=4           # ZIP responses share the same ~4.5 MB ceiling
OW_MAX_DECODED_PIXELS=24000000
OW_PG_POOL_MAX=3          # reuse across isolate invocations; do not raise on serverless
OW_IMAGE_TIMEOUT_MS=8000  # Hobby plan functions time out at 10 s
```

`OW_MAX_BATCH_MB` (default `0` = disabled) makes the app reject an over-budget batch itself
with an actionable message instead of the platform returning an opaque 413.

**Function timeout:** `maxDuration = 60` is declared on the image routes. AVIF encoding of
large images can exceed the Hobby plan's 10 s default; use Pro or higher, or lower
`OW_IMAGE_TIMEOUT_MS` and reject very large sources client-side.

### Self-hosted / container (Fly.io, Railway, Render, ECS)

The reference target — no request-body ceiling beyond what you configure, and full control of
the sharp worker. Set `DATABASE_URL` to a reachable PostgreSQL (Neon, Supabase, RDS, or your own).

```bash
npm ci
npx drizzle-kit push
npm run build
npm run start
```

## Multi-instance considerations

1. **Rate limits are in-process.** With more than one instance, move
   `src/server/middleware/rateLimit.ts` to a shared store (Redis `INCR`/`EXPIRE`). The surface
   is a single `consumeRateLimit(bucket, key)` call.
2. **Guest sessions are stateless** (opaque httpOnly cookie) — no session store required.
3. **sharp** ships prebuilt binaries; on musl/exotic platforms install the matching `@img/*`
   optional dependency.
4. **Artifacts live in the database**, so instances can be restarted freely. The 24 h prune
   runs opportunistically on each persist; schedule a cron calling
   `DELETE FROM job_artifacts WHERE created_at < now() - interval '24 hours'` if you need
   deterministic reclamation.

## Verification before declaring a deployment healthy

```bash
curl -s https://<host>/api/v1/health | jq .data.database.connected   # must be true
node scripts/api-selftest.mjs https://<host>                          # 71/71
```

The self-test creates and deletes jobs in its own guest session. It also exhausts a rate-limit
bucket near the end, so expect ~60 s of 429s on `/api/v1/css/*` afterwards if you re-run it
immediately.

## Not verified

- No deployment has been executed from this environment; no Vercel project, build or URL exists.
- No MongoDB Atlas connection has been attempted.
- `vercel.json` is intentionally absent — Next.js is auto-detected on Vercel, and adding a
  config we cannot deploy-and-test would be unverifiable.

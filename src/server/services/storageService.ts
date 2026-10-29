/**
 * Persistence for job metadata, per-file results and produced artifacts.
 * Image bytes live in `job_artifacts` (bytea) with a TTL; `jobs`/`job_items`
 * stay small so history queries never drag megabytes off disk.
 */
import { and, asc, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobArtifacts, jobItems, jobs, preferences } from "@/db/schema";
import { limits } from "@/server/config/env";
import { storageUnavailable } from "@/server/http/errors";
import type {
  HistoryEntry,
  HistoryPage,
  ImageResult,
  JobKind,
  JobStatus,
  Preferences,
} from "@/types/domain";

export type PersistItem = {
  filename: string;
  outputFilename?: string;
  status: "completed" | "failed";
  inputBytes: number;
  outputBytes: number;
  savedBytes: number;
  savingsPercent: number | null;
  inputWidth?: number | null;
  inputHeight?: number | null;
  outputWidth?: number | null;
  outputHeight?: number | null;
  outputFormat?: string | null;
  message?: string;
  artifact?: { filename: string; contentType: string; data: Buffer; kind: string } | null;
};

/** Postgres SQLSTATE 42P01 = relation does not exist (schema not pushed yet). */
function isUndefinedTable(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "42P01"
  );
}

/** Returns null when persistence is unavailable so the tool can degrade gracefully. */
export async function persistJob(params: {
  sessionId: string;
  kind: JobKind;
  status: JobStatus;
  label: string;
  fileCount: number;
  inputBytes: number;
  outputBytes: number;
  savedBytes: number;
  note?: string | null;
  items: PersistItem[];
}): Promise<{ jobId: string | null; artifacts: Map<string, string>; persisted: boolean }> {
  const artifacts = new Map<string, string>();
  try {
    await pruneExpiredArtifacts();

    const [job] = await db
      .insert(jobs)
      .values({
        sessionId: params.sessionId,
        kind: params.kind,
        status: params.status,
        label: params.label,
        fileCount: params.fileCount,
        inputBytes: params.inputBytes,
        outputBytes: params.outputBytes,
        savedBytes: params.savedBytes,
        note: params.note ?? null,
      })
      .returning({ id: jobs.id });

    if (params.items.length > 0) {
      // `job_items.id` doubles as the artifact id, so a download link resolves
      // straight from the per-file row.
      const prepared = params.items.map((item) => ({ item, id: crypto.randomUUID() }));

      const artifactRows = prepared
        .filter((entry) => Boolean(entry.item.artifact))
        .map(({ item, id }) => {
          const artifact = item.artifact as NonNullable<PersistItem["artifact"]>;
          artifacts.set(id, artifact.filename);
          return {
            id,
            jobId: job.id,
            sessionId: params.sessionId,
            filename: artifact.filename,
            contentType: artifact.contentType,
            byteSize: artifact.data.byteLength,
            kind: artifact.kind,
            data: artifact.data,
          };
        });

      await db.insert(jobItems).values(
        prepared.map(({ item, id }) => ({
          id,
          jobId: job.id,
          sessionId: params.sessionId,
          filename: item.filename,
          outputFilename: item.outputFilename ?? null,
          status: item.status,
          inputBytes: item.inputBytes,
          outputBytes: item.outputBytes,
          savedBytes: item.savedBytes,
          savingsPercent: item.savingsPercent,
          inputWidth: item.inputWidth ?? null,
          inputHeight: item.inputHeight ?? null,
          outputWidth: item.outputWidth ?? null,
          outputHeight: item.outputHeight ?? null,
          outputFormat: item.outputFormat ?? null,
          message: item.message ?? null,
          artifactId: item.artifact ? id : null,
        })),
      );

      if (artifactRows.length > 0) {
        await db.insert(jobArtifacts).values(artifactRows);
      }
    }

    return { jobId: job.id, artifacts, persisted: true };
  } catch (error) {
    if (isUndefinedTable(error)) {
      console.error("[storage] history tables are missing; run `npx drizzle-kit push`.");
    } else {
      console.error(
        "[storage] could not persist job:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
    return { jobId: null, artifacts, persisted: false };
  }
}

export async function pruneExpiredArtifacts(): Promise<void> {
  const cutoff = new Date(Date.now() - limits.artifactTtlHours * 60 * 60 * 1000);
  await db.delete(jobArtifacts).where(lt(jobArtifacts.createdAt, cutoff));
}

export async function listHistory(
  sessionId: string,
  query: { q?: string; kind: string; status: string; sort: string; page: number; pageSize: number },
): Promise<HistoryPage> {
  const filters = [eq(jobs.sessionId, sessionId)];
  if (query.kind !== "all") filters.push(eq(jobs.kind, query.kind));
  if (query.status !== "all") filters.push(eq(jobs.status, query.status));
  if (query.q) filters.push(sql`${jobs.label} ILIKE ${`%${query.q}%`}`);

  const where = and(...filters);
  const order =
    query.sort === "oldest"
      ? asc(jobs.createdAt)
      : query.sort === "saved"
        ? desc(jobs.savedBytes)
        : desc(jobs.createdAt);

  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
    .select({
      id: jobs.id,
      kind: jobs.kind,
      status: jobs.status,
      label: jobs.label,
      fileCount: jobs.fileCount,
      inputBytes: jobs.inputBytes,
      outputBytes: jobs.outputBytes,
      savedBytes: jobs.savedBytes,
      note: jobs.note,
      createdAt: jobs.createdAt,
      itemCount: sql<number>`(select count(*)::int from ${jobItems} where ${jobItems.jobId} = ${jobs.id})`,
      artifactIds: sql<
        string[] | null
      >`(select coalesce(array_agg(${jobItems.id}) filter (where ${jobItems.artifactId} is not null), '{}') from ${jobItems} where ${jobItems.jobId} = ${jobs.id})`,
    })
    .from(jobs)
    .where(where)
    .orderBy(order)
    .limit(query.pageSize)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(jobs)
    .where(where);

  const entries: HistoryEntry[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind as JobKind,
    status: row.status as JobStatus,
    label: row.label,
    fileCount: row.fileCount,
    inputBytes: Number(row.inputBytes),
    outputBytes: Number(row.outputBytes),
    savedBytes: Number(row.savedBytes),
    savingsPercent:
      Number(row.inputBytes) > 0 ? (Number(row.savedBytes) / Number(row.inputBytes)) * 100 : null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    itemCount: Number(row.itemCount ?? 0),
    artifactIds: row.artifactIds ?? [],
  }));

  return {
    entries,
    total: Number(total),
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(Number(total) / query.pageSize)),
  };
}

export async function getJobDetail(sessionId: string, jobId: string) {
  if (!isUuid(jobId)) return null;
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.sessionId, sessionId)))
    .limit(1);
  if (!job) return null;

  const items = await db.select().from(jobItems).where(eq(jobItems.jobId, jobId)).orderBy(asc(jobItems.filename));
  return { job, items };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function getArtifact(sessionId: string, artifactId: string) {
  // A malformed id must never reach the query: Postgres would raise a cast
  // error that surfaced as a 500 (and logged the SQL) before this guard.
  if (!isUuid(artifactId)) return null;
  const [row] = await db
    .select({
      id: jobArtifacts.id,
      filename: jobArtifacts.filename,
      contentType: jobArtifacts.contentType,
      data: jobArtifacts.data,
      byteSize: jobArtifacts.byteSize,
      itemFilename: jobItems.filename,
    })
    .from(jobArtifacts)
    .leftJoin(jobItems, eq(jobItems.id, jobArtifacts.id))
    .where(and(eq(jobArtifacts.id, artifactId), eq(jobArtifacts.sessionId, sessionId)))
    .limit(1);
  return row ?? null;
}

export async function getArtifactsByIds(sessionId: string, ids: string[]) {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return [];
  return db
    .select({
      id: jobArtifacts.id,
      filename: jobArtifacts.filename,
      contentType: jobArtifacts.contentType,
      data: jobArtifacts.data,
    })
    .from(jobArtifacts)
    .where(and(eq(jobArtifacts.sessionId, sessionId), inArray(jobArtifacts.id, valid)));
}

export async function deleteJob(sessionId: string, jobId: string): Promise<boolean> {
  if (!isUuid(jobId)) return false;
  const deleted = await db
    .delete(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.sessionId, sessionId)))
    .returning({ id: jobs.id });
  return deleted.length > 0;
}

export async function clearSessionHistory(sessionId: string): Promise<number> {
  const deleted = await db
    .delete(jobs)
    .where(eq(jobs.sessionId, sessionId))
    .returning({ id: jobs.id });
  return deleted.length;
}

export async function sessionSummary(sessionId: string) {
  const rows = await db
    .select({
      jobs: count(),
      savedBytes: sql<string>`coalesce(sum(${jobs.savedBytes}), 0)`,
      inputBytes: sql<string>`coalesce(sum(${jobs.inputBytes}), 0)`,
      files: sql<string>`coalesce(sum(${jobs.fileCount}), 0)`,
      completed: sql<string>`coalesce(sum(case when ${jobs.status} = 'completed' then 1 else 0 end), 0)`,
    })
    .from(jobs)
    .where(eq(jobs.sessionId, sessionId));

  const row = rows[0];
  return {
    jobs: Number(row?.jobs ?? 0),
    savedBytes: Number(row?.savedBytes ?? 0),
    inputBytes: Number(row?.inputBytes ?? 0),
    files: Number(row?.files ?? 0),
    completed: Number(row?.completed ?? 0),
  };
}

export async function getPreferences(sessionId: string): Promise<Preferences | null> {
  try {
    const [row] = await db
      .select()
      .from(preferences)
      .where(eq(preferences.sessionId, sessionId))
      .limit(1);
    if (!row) return null;
    return {
      defaultImageFormat: row.defaultImageFormat as Preferences["defaultImageFormat"],
      defaultQuality: row.defaultQuality,
      defaultMaxWidth: row.defaultMaxWidth,
      fontDisplayPolicy: row.fontDisplayPolicy as Preferences["fontDisplayPolicy"],
      analyzerThresholdKb: row.analyzerThresholdKb,
      reduceMotion: row.reduceMotion === 1,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error(
      "[storage] could not read preferences:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}

export async function savePreferences(sessionId: string, next: Preferences): Promise<Preferences> {
  const values = {
    sessionId,
    defaultImageFormat: next.defaultImageFormat,
    defaultQuality: next.defaultQuality,
    defaultMaxWidth: next.defaultMaxWidth,
    fontDisplayPolicy: next.fontDisplayPolicy,
    analyzerThresholdKb: next.analyzerThresholdKb,
    reduceMotion: next.reduceMotion ? 1 : 0,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(preferences)
    .values(values)
    .onConflictDoUpdate({ target: preferences.sessionId, set: values })
    .returning();
  return {
    defaultImageFormat: row.defaultImageFormat as Preferences["defaultImageFormat"],
    defaultQuality: row.defaultQuality,
    defaultMaxWidth: row.defaultMaxWidth,
    fontDisplayPolicy: row.fontDisplayPolicy as Preferences["fontDisplayPolicy"],
    analyzerThresholdKb: row.analyzerThresholdKb,
    reduceMotion: row.reduceMotion === 1,
    updatedAt: row.updatedAt.toISOString(),
  };
}


export type { ImageResult };

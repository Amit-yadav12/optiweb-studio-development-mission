/**
 * OptiWeb Studio — persistence schema (PostgreSQL / Drizzle ORM).
 *
 * Design rules:
 * - `jobs` holds only metadata about a run (never image bytes).
 * - `job_items` holds per-file results so a batch can be inspected later.
 * - `job_artifacts` holds the produced bytes (bytea) so downloads survive a
 *   server restart. Artifacts are pruned on a TTL, which keeps storage bounded.
 * - Every table is scoped by `session_id`: guest history is session-scoped and
 *   one visitor can never read another visitor's rows.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  customType,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id").notNull(),
    /** image.optimize | css.font-display | asset.analyze */
    kind: text("kind").notNull(),
    /** completed | partial | failed */
    status: text("status").notNull(),
    label: text("label").notNull(),
    fileCount: integer("file_count").notNull().default(1),
    inputBytes: bigint("input_bytes", { mode: "number" }).notNull().default(0),
    outputBytes: bigint("output_bytes", { mode: "number" }).notNull().default(0),
    savedBytes: bigint("saved_bytes", { mode: "number" }).notNull().default(0),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("jobs_session_created_idx").on(table.sessionId, table.createdAt),
    index("jobs_session_kind_idx").on(table.sessionId, table.kind),
  ],
);

export const jobItems = pgTable(
  "job_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    filename: text("filename").notNull(),
    /** Name of the produced file (e.g. "hero-optiweb.webp"). */
    outputFilename: text("output_filename"),
    /** completed | failed */
    status: text("status").notNull(),
    inputBytes: bigint("input_bytes", { mode: "number" }).notNull().default(0),
    outputBytes: bigint("output_bytes", { mode: "number" }).notNull().default(0),
    savedBytes: bigint("saved_bytes", { mode: "number" }).notNull().default(0),
    savingsPercent: real("savings_percent"),
    inputWidth: integer("input_width"),
    inputHeight: integer("input_height"),
    outputWidth: integer("output_width"),
    outputHeight: integer("output_height"),
    outputFormat: text("output_format"),
    artifactId: uuid("artifact_id"),
    message: text("message"),
  },
  (table) => [index("job_items_job_idx").on(table.jobId)],
);

export const jobArtifacts = pgTable(
  "job_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    kind: text("kind").notNull().default("image"),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("job_artifacts_session_idx").on(table.sessionId, table.createdAt),
    // Supports the TTL prune, which filters on createdAt alone.
    index("job_artifacts_created_idx").on(table.createdAt),
  ],
);

export const preferences = pgTable("preferences", {
  sessionId: text("session_id").primaryKey(),
  defaultImageFormat: text("default_image_format").notNull().default("webp"),
  defaultQuality: integer("default_quality").notNull().default(78),
  defaultMaxWidth: integer("default_max_width"),
  fontDisplayPolicy: text("font_display_policy").notNull().default("swap"),
  analyzerThresholdKb: integer("analyzer_threshold_kb").notNull().default(300),
  reduceMotion: integer("reduce_motion").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type JobRow = typeof jobs.$inferSelect;
export type JobItemRow = typeof jobItems.$inferSelect;
export type JobArtifactRow = typeof jobArtifacts.$inferSelect;
export type PreferenceRow = typeof preferences.$inferSelect;

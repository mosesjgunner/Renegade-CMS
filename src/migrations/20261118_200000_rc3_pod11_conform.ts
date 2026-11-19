import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-11 (POD-REQ-25): guest local recording conform.
 *
 * - `podcast_recordings` gains `conform_reports` (jsonb): the
 *   per-guest conform reports the `podcast-conform-track` job stores
 *   (fallback state, the POD-00 EDL rateCorrection artefact POD-12
 *   consumes, the measured conform report, the conformed asset
 *   checksum), upserted by track id.
 * - The `podcast-conform-track` task slug is added to Payload's
 *   `enum_payload_jobs_task_slug` and `enum_payload_jobs_log_task_slug`
 *   (both enums bake registered task slugs; queueing fails without
 *   them — the POD-02 lesson).
 *
 * No new tables: guest journal chunks live in chunk storage (the
 * POD-06 layout), sync pairs + gap records live on the POD-05 session
 * document's `guestRecordings` extension, and conformed tracks are
 * ordinary media assets.
 *
 * Rollback note: `down` drops exactly the column it adds, destroying
 * stored conform reports (the conformed media assets and the
 * session-document copies of the reports survive; re-running the
 * conform job regenerates them deterministically). The task-slug
 * enum values cannot be removed by Postgres and stay, inert.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_recordings"
      ADD COLUMN IF NOT EXISTS "conform_reports" jsonb;
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'podcast-conform-track';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'podcast-conform-track';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_recordings"
      DROP COLUMN IF EXISTS "conform_reports";
  `)
}

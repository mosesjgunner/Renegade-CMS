import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-09 (POD-REQ-19, POD-REQ-20): multitrack recording finalize +
 * storage policy.
 *
 * One new table, `podcast_recordings`: one row per finalized recording
 * session (site/show/session/episode relations; the POD-00
 * TrackManifest as jsonb in `manifest`; live markers, the POD-08
 * played-clip log and the session log as jsonb for POD-12; per-track
 * media assets as jsonb in `track_assets`; the retention snapshot —
 * `retention_policy` jsonb + `retain_until` — that the
 * `podcast-recording-cleanup` task consumes). `state` enum:
 * recording/finalizing/finalized/degraded/failed/expired.
 * podcast-shows gain `recording_retention_days` (numeric, nullable —
 * empty = the default 30-day grace; see
 * src/modules/podcast-studio/recording/storage-policy.ts). The two new
 * task slugs (`podcast-recording-finalize`,
 * `podcast-recording-cleanup`) are added to Payload's
 * `enum_payload_jobs_task_slug` and `enum_payload_jobs_log_task_slug`
 * (both enums bake registered task slugs; queueing fails without
 * them — the POD-02 lesson). The table gains its
 * `payload_locked_documents_rels` column following the standard
 * Payload pattern. Relationship columns are nullable at the DB level
 * with ON DELETE SET NULL, matching every existing Payload table in
 * this schema (required-ness is enforced by Payload validation, not
 * the column).
 *
 * Rollback note: `down` drops exactly what `up` adds. Dropping
 * `podcast_recordings` destroys every finalized recording's manifest,
 * marker/log record and retention state recorded after this migration
 * (the track media assets and their bytes are separate rows/objects
 * and survive, orphaned); dropping `recording_retention_days` discards
 * per-show retention overrides (shows fall back to the 30-day
 * default). The two task-slug enum values cannot be removed by
 * Postgres and stay, inert. Export podcast_recordings first if a
 * rollback must keep that state.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_recordings_state" AS ENUM('recording', 'finalizing', 'finalized', 'degraded', 'failed', 'expired');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    ALTER TABLE "podcast_shows"
      ADD COLUMN IF NOT EXISTS "recording_retention_days" numeric;
    CREATE TABLE IF NOT EXISTS "podcast_recordings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid,
      "show_id" uuid,
      "session_id" uuid,
      "episode_id" uuid,
      "state" "enum_podcast_recordings_state" DEFAULT 'recording',
      "manifest" jsonb,
      "markers" jsonb,
      "played_clip_log" jsonb,
      "session_log" jsonb,
      "track_assets" jsonb,
      "retention_policy" jsonb,
      "retain_until" timestamp(3) with time zone,
      "finalized_at" timestamp(3) with time zone,
      "error_message" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "podcast_recordings_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "podcast_recordings"
        ADD CONSTRAINT "podcast_recordings_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_recordings"
        ADD CONSTRAINT "podcast_recordings_show_id_podcast_shows_id_fk"
        FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_recordings"
        ADD CONSTRAINT "podcast_recordings_session_id_podcast_studio_sessions_id_fk"
        FOREIGN KEY ("session_id") REFERENCES "public"."podcast_studio_sessions"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_recordings"
        ADD CONSTRAINT "podcast_recordings_episode_id_podcast_episodes_id_fk"
        FOREIGN KEY ("episode_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_recordings_fk"
        FOREIGN KEY ("podcast_recordings_id") REFERENCES "public"."podcast_recordings"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "podcast_recordings_site_idx" ON "podcast_recordings" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "podcast_recordings_show_idx" ON "podcast_recordings" USING btree ("show_id");
    CREATE INDEX IF NOT EXISTS "podcast_recordings_session_idx" ON "podcast_recordings" USING btree ("session_id");
    CREATE INDEX IF NOT EXISTS "podcast_recordings_episode_idx" ON "podcast_recordings" USING btree ("episode_id");
    CREATE INDEX IF NOT EXISTS "podcast_recordings_updated_at_idx" ON "podcast_recordings" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_recordings_created_at_idx" ON "podcast_recordings" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_recordings_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_recordings_id");
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'podcast-recording-finalize';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'podcast-recording-finalize';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'podcast-recording-cleanup';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'podcast-recording-cleanup';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_recordings_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_recordings_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "podcast_recordings_id";
    DROP TABLE IF EXISTS "podcast_recordings";
    DROP TYPE IF EXISTS "public"."enum_podcast_recordings_state";
    ALTER TABLE "podcast_shows"
      DROP COLUMN IF EXISTS "recording_retention_days";
  `)
}

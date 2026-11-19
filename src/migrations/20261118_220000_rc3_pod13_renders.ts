import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-13 (POD-REQ-28, POD-REQ-29): render & export pipeline.
 *
 * - New table `podcast_renders`: one row per (project, EDL hash,
 *   profile, range) render with a UNIQUE `idempotency_key` (the
 *   retry/idempotency anchor for the `podcast-render` task), state
 *   enum queued/rendering/completed/failed, the render report and
 *   registered outputs as jsonb, and site/show/project/episode
 *   relations (nullable at the DB level with ON DELETE SET NULL,
 *   matching the schema-wide Payload convention; required-ness is
 *   Payload-level). Plus its `payload_locked_documents_rels` column.
 * - `podcast_shows` gain `export_profile` (jsonb): the per-show
 *   filename/tag templates + bitrates for MP3/Opus exports.
 * - `podcast_episodes` gain `render_provenance` (jsonb): EDL
 *   version/hash, recipe, loudness measurements, renderedAt, job id
 *   for the currently attached master.
 * - The `podcast-render` task slug is added to Payload's
 *   `enum_payload_jobs_task_slug` and `enum_payload_jobs_log_task_slug`
 *   (both enums bake registered task slugs; queueing fails without
 *   them — the POD-02 lesson).
 *
 * Rollback note: `down` drops exactly what `up` adds. Dropping
 * `podcast_renders` destroys render reports/provenance rows (the
 * rendered media assets and their bytes are separate rows and
 * survive, orphaned of their render records); dropping
 * `export_profile` / `render_provenance` discards stored export
 * profiles and episode render provenance. The task-slug enum values
 * cannot be removed by Postgres and stay, inert.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_renders_profile" AS ENUM('master', 'preview', 'clip', 'audiogram');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_renders_state" AS ENUM('queued', 'rendering', 'completed', 'failed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE TABLE IF NOT EXISTS "podcast_renders" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid,
      "show_id" uuid,
      "project_id" uuid,
      "episode_id" uuid,
      "profile" "enum_podcast_renders_profile" DEFAULT 'master',
      "state" "enum_podcast_renders_state" DEFAULT 'queued',
      "idempotency_key" varchar,
      "edl_hash" varchar,
      "edl_version" numeric,
      "range" jsonb,
      "report" jsonb,
      "outputs" jsonb,
      "error_message" varchar,
      "job_id" varchar,
      "started_at" timestamp(3) with time zone,
      "finished_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "podcast_renders_idempotency_key_idx" ON "podcast_renders" USING btree ("idempotency_key");
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "podcast_renders_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "podcast_renders"
        ADD CONSTRAINT "podcast_renders_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_renders"
        ADD CONSTRAINT "podcast_renders_show_id_podcast_shows_id_fk"
        FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_renders"
        ADD CONSTRAINT "podcast_renders_project_id_podcast_edit_projects_id_fk"
        FOREIGN KEY ("project_id") REFERENCES "public"."podcast_edit_projects"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_renders"
        ADD CONSTRAINT "podcast_renders_episode_id_podcast_episodes_id_fk"
        FOREIGN KEY ("episode_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_renders_fk"
        FOREIGN KEY ("podcast_renders_id") REFERENCES "public"."podcast_renders"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "podcast_renders_site_idx" ON "podcast_renders" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "podcast_renders_show_idx" ON "podcast_renders" USING btree ("show_id");
    CREATE INDEX IF NOT EXISTS "podcast_renders_project_idx" ON "podcast_renders" USING btree ("project_id");
    CREATE INDEX IF NOT EXISTS "podcast_renders_episode_idx" ON "podcast_renders" USING btree ("episode_id");
    CREATE INDEX IF NOT EXISTS "podcast_renders_edl_hash_idx" ON "podcast_renders" USING btree ("edl_hash");
    CREATE INDEX IF NOT EXISTS "podcast_renders_updated_at_idx" ON "podcast_renders" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_renders_created_at_idx" ON "podcast_renders" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_renders_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_renders_id");
    ALTER TABLE "podcast_shows"
      ADD COLUMN IF NOT EXISTS "export_profile" jsonb;
    ALTER TABLE "podcast_episodes"
      ADD COLUMN IF NOT EXISTS "render_provenance" jsonb;
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'podcast-render';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'podcast-render';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_renders_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_renders_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "podcast_renders_id";
    DROP TABLE IF EXISTS "podcast_renders";
    DROP TYPE IF EXISTS "public"."enum_podcast_renders_profile";
    DROP TYPE IF EXISTS "public"."enum_podcast_renders_state";
    ALTER TABLE "podcast_shows"
      DROP COLUMN IF EXISTS "export_profile";
    ALTER TABLE "podcast_episodes"
      DROP COLUMN IF EXISTS "render_provenance";
  `)
}

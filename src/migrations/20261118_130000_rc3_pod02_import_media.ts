import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-02 (POD-REQ-06, POD-REQ-07): podcast import media migration +
 * reconciliation.
 *
 * podcast-episodes gain the per-episode media migration state machine:
 * `media_migration_state` (not-requested/pending/fetching/verifying/done/
 * failed), `media_migration_error` (the visible failure reason for the
 * failed state), and `media_checksum` (bare sha256 hex of the fetched
 * enclosure bytes, verified before the episode's audio is re-pointed at a
 * locally stored media-asset). podcast-shows gain `ownership_changed_at`,
 * stamped when a local edit takes ownership of a claimed-import show
 * (importOwnership flips claimed-import → local). The
 * `podcast-import-media` queue task slug is added to Payload's
 * `enum_payload_jobs_task_slug` (Payload bakes registered task slugs
 * into that enum; queueing fails without it).
 *
 * Rollback note: `down` drops exactly the columns and the enum type `up`
 * adds. Dropping them discards migration states, failure reasons, fetched
 * checksums, and ownership-change timestamps recorded after this
 * migration — the migrated media-assets and blobs themselves are NOT
 * touched, and episodes keep pointing at their local audio; only the
 * migration bookkeeping is lost. Export podcast-episodes /
 * podcast-shows first if a rollback must keep that bookkeeping.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_episodes_media_migration_state" AS ENUM('not-requested', 'pending', 'fetching', 'verifying', 'done', 'failed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    ALTER TABLE "podcast_episodes"
      ADD COLUMN IF NOT EXISTS "media_migration_state" "enum_podcast_episodes_media_migration_state" DEFAULT 'not-requested',
      ADD COLUMN IF NOT EXISTS "media_migration_error" varchar,
      ADD COLUMN IF NOT EXISTS "media_checksum" varchar;
    ALTER TABLE "podcast_shows"
      ADD COLUMN IF NOT EXISTS "ownership_changed_at" timestamp(3) with time zone;
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'podcast-import-media';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'podcast-import-media';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Note: Postgres cannot remove a value from an enum type, so the
  // 'podcast-import-media' task-slug value added in `up` stays in
  // enum_payload_jobs_task_slug after rollback. It is inert once the
  // task is unregistered (no job rows can be created for it).
  await db.execute(sql`
    ALTER TABLE "podcast_shows"
      DROP COLUMN IF EXISTS "ownership_changed_at";
    ALTER TABLE "podcast_episodes"
      DROP COLUMN IF EXISTS "media_checksum",
      DROP COLUMN IF EXISTS "media_migration_error",
      DROP COLUMN IF EXISTS "media_migration_state";
    DROP TYPE IF EXISTS "public"."enum_podcast_episodes_media_migration_state";
  `)
}

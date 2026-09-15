import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "site_settings"
      ADD COLUMN IF NOT EXISTS "canonical_origins_by_site" jsonb,
      ADD COLUMN IF NOT EXISTS "discovery_defaults" jsonb,
      ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb,
      ADD COLUMN IF NOT EXISTS "launch_state" varchar NOT NULL DEFAULT 'live',
      ADD COLUMN IF NOT EXISTS "launched_at" timestamptz;
    ALTER TABLE IF EXISTS "content" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "events" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "timelines" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "podcast_shows" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "podcast_episodes" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "videos" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS "videos" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "podcast_episodes" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "podcast_shows" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "timelines" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "events" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "content" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "launched_at", DROP COLUMN IF EXISTS "launch_state", DROP COLUMN IF EXISTS "discovery_overrides", DROP COLUMN IF EXISTS "discovery_defaults", DROP COLUMN IF EXISTS "canonical_origins_by_site";
  `)
}

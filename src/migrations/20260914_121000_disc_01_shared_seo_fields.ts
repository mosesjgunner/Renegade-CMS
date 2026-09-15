import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Keep every collection using canonical-shared seoFields aligned with Payload's schema. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS "books" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "video_channels" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "video_playlists" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "interviews" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "livestreams" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS "livestreams" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "interviews" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "video_playlists" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "video_channels" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "books" DROP COLUMN IF EXISTS "discovery_overrides";
  `)
}

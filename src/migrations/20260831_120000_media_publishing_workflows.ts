import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/** Adds lifecycle/provenance fields without changing existing provider identities or media references. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "import_ownership" varchar DEFAULT 'local';
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "import_source_checksum" varchar;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "enclosure_bytes" numeric;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "enclosure_mime_type" varchar;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "import_source_checksum" varchar;
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "native_media_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL;
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "availability" varchar DEFAULT 'available';
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "provider_source_checksum" varchar;
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "sync_claimed" boolean DEFAULT false;
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    CREATE TABLE IF NOT EXISTS "videos_rels" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE cascade,
      "path" varchar NOT NULL,
      "media_assets_id" uuid REFERENCES "media_assets"("id") ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS "videos_rels_parent_idx" ON "videos_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "videos_rels_media_assets_idx" ON "videos_rels" ("media_assets_id");
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "podcast_shows" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at", DROP COLUMN IF EXISTS "import_ownership", DROP COLUMN IF EXISTS "import_source_checksum";
    ALTER TABLE "podcast_episodes" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at", DROP COLUMN IF EXISTS "enclosure_bytes", DROP COLUMN IF EXISTS "enclosure_mime_type", DROP COLUMN IF EXISTS "import_source_checksum";
    ALTER TABLE "videos" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at", DROP COLUMN IF EXISTS "native_media_id", DROP COLUMN IF EXISTS "availability", DROP COLUMN IF EXISTS "provider_source_checksum";
    ALTER TABLE "video_channels" DROP COLUMN IF EXISTS "sync_claimed";
    ALTER TABLE "video_channels" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at";
    ALTER TABLE "video_playlists" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at";
    ALTER TABLE "interviews" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at";
    ALTER TABLE "livestreams" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at";
    DROP TABLE IF EXISTS "videos_rels" CASCADE;
  `)
}

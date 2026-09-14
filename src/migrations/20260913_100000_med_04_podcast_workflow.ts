import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** MED-04 adds podcast facts to the existing media/editorial records; it does not create a second CMS. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "audio_metadata" jsonb;
    ALTER TABLE "podcast_shows"
      ADD COLUMN IF NOT EXISTS "language" varchar DEFAULT 'en',
      ADD COLUMN IF NOT EXISTS "explicit" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "body" text;
    ALTER TABLE "podcast_episodes"
      ADD COLUMN IF NOT EXISTS "artwork_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "explicit" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "language" varchar,
      ADD COLUMN IF NOT EXISTS "guid" varchar,
      ADD COLUMN IF NOT EXISTS "credits" varchar,
      ADD COLUMN IF NOT EXISTS "rights" jsonb,
      ADD COLUMN IF NOT EXISTS "season_number" numeric,
      ADD COLUMN IF NOT EXISTS "body" text;
    CREATE UNIQUE INDEX IF NOT EXISTS "podcast_episodes_guid_idx" ON "podcast_episodes" ("guid") WHERE "guid" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "podcast_episodes_show_published_idx" ON "podcast_episodes" ("show_id", "published_at" DESC);
    ALTER TABLE "podcast_episodes_rels"
      ADD COLUMN IF NOT EXISTS "categories_id" uuid REFERENCES "categories"("id") ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS "podcast_episodes_rels_categories_id_idx" ON "podcast_episodes_rels" ("categories_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "podcast_episodes_rels_categories_id_idx";
    ALTER TABLE "podcast_episodes_rels" DROP COLUMN IF EXISTS "categories_id";
    DROP INDEX IF EXISTS "podcast_episodes_show_published_idx";
    DROP INDEX IF EXISTS "podcast_episodes_guid_idx";
    ALTER TABLE "podcast_episodes" DROP COLUMN IF EXISTS "body", DROP COLUMN IF EXISTS "season_number", DROP COLUMN IF EXISTS "rights", DROP COLUMN IF EXISTS "credits", DROP COLUMN IF EXISTS "guid", DROP COLUMN IF EXISTS "language", DROP COLUMN IF EXISTS "explicit", DROP COLUMN IF EXISTS "artwork_id";
    ALTER TABLE "podcast_shows" DROP COLUMN IF EXISTS "body", DROP COLUMN IF EXISTS "explicit", DROP COLUMN IF EXISTS "language";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "audio_metadata";
  `)
}

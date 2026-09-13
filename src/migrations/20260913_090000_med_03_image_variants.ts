import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** MED-03: image variant engine, metadata extraction, focal-point crop, and modern format support. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media_variants"
      ADD COLUMN IF NOT EXISTS "format" varchar,
      ADD COLUMN IF NOT EXISTS "recipe_key" varchar,
      ADD COLUMN IF NOT EXISTS "recipe_version" numeric NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "previous_blob_id" uuid REFERENCES "media_blobs"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "crop" jsonb,
      ADD COLUMN IF NOT EXISTS "error_message" varchar,
      ADD COLUMN IF NOT EXISTS "size_bytes" numeric,
      ADD COLUMN IF NOT EXISTS "last_accessed_at" timestamptz;

    CREATE INDEX IF NOT EXISTS "media_variants_asset_recipe_idx"
      ON "media_variants" ("asset_id", "recipe_key", "format");

    CREATE INDEX IF NOT EXISTS "media_variants_processing_state_idx"
      ON "media_variants" ("processing_state");

    CREATE INDEX IF NOT EXISTS "media_variants_previous_blob_idx"
      ON "media_variants" ("previous_blob_id");

    ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "dominant_color" varchar,
      ADD COLUMN IF NOT EXISTS "color_palette" jsonb,
      ADD COLUMN IF NOT EXISTS "crop_settings" jsonb,
      ADD COLUMN IF NOT EXISTS "aspect_ratio" numeric;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "media_variants_processing_state_idx";
    DROP INDEX IF EXISTS "media_variants_asset_recipe_idx";
    DROP INDEX IF EXISTS "media_variants_previous_blob_idx";

    ALTER TABLE "media_assets"
      DROP COLUMN IF EXISTS "aspect_ratio",
      DROP COLUMN IF EXISTS "crop_settings",
      DROP COLUMN IF EXISTS "color_palette",
      DROP COLUMN IF EXISTS "dominant_color";

    ALTER TABLE "media_variants"
      DROP COLUMN IF EXISTS "last_accessed_at",
      DROP COLUMN IF EXISTS "previous_blob_id",
      DROP COLUMN IF EXISTS "size_bytes",
      DROP COLUMN IF EXISTS "error_message",
      DROP COLUMN IF EXISTS "crop",
      DROP COLUMN IF EXISTS "recipe_version",
      DROP COLUMN IF EXISTS "recipe_key",
      DROP COLUMN IF EXISTS "format";
  `)
}

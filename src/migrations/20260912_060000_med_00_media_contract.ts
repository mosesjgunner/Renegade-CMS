import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** MED-00: separate editorial assets from physical objects and generated variants. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "media_blobs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "checksum" varchar NOT NULL, "storage_key" varchar NOT NULL UNIQUE,
      "storage_provider" varchar NOT NULL, "mime_type" varchar NOT NULL,
      "size_bytes" numeric NOT NULL, "state" varchar NOT NULL DEFAULT 'ready',
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "media_blobs_site_checksum_idx" ON "media_blobs" ("site_id", "checksum");
    CREATE TABLE IF NOT EXISTS "media_variants" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE CASCADE,
      "blob_id" uuid NOT NULL REFERENCES "media_blobs"("id") ON DELETE RESTRICT,
      "label" varchar NOT NULL, "kind" varchar NOT NULL,
      "width" numeric, "height" numeric, "duration_seconds" numeric,
      "processing_state" varchar NOT NULL DEFAULT 'ready',
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE "media_assets" DROP CONSTRAINT IF EXISTS "media_assets_storage_location_key";
    DROP INDEX IF EXISTS "media_assets_storage_location_idx";
    ALTER TABLE "media_assets" ALTER COLUMN "storage_location" DROP NOT NULL;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "original_blob_id" uuid REFERENCES "media_blobs"("id") ON DELETE RESTRICT;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "original_filename" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "rights_source_url" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "rights_expires_at" timestamptz;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "processing_state" varchar NOT NULL DEFAULT 'ready';
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "public_policy" varchar NOT NULL DEFAULT 'published-use';
    CREATE INDEX IF NOT EXISTS "media_assets_original_blob_idx" ON "media_assets"("original_blob_id");
    ALTER TABLE "media_usages" ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE;
    ALTER TABLE "media_usages" ADD COLUMN IF NOT EXISTS "approved_for_public" boolean NOT NULL DEFAULT false;
    UPDATE "media_usages" usage SET "site_id" = asset."site_id"
      FROM "media_assets" asset WHERE usage."media_id" = asset."id" AND usage."site_id" IS NULL;
    CREATE INDEX IF NOT EXISTS "media_usages_site_idx" ON "media_usages"("site_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_blobs_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_blobs_fk" FOREIGN KEY ("media_blobs_id") REFERENCES "media_blobs"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_blobs_id_idx" ON "payload_locked_documents_rels" ("media_blobs_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_variants_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_variants_fk" FOREIGN KEY ("media_variants_id") REFERENCES "media_variants"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_variants_id_idx" ON "payload_locked_documents_rels" ("media_variants_id");

    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "page_layouts_id" uuid;
    DO $$ BEGIN ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_page_layouts_fk" FOREIGN KEY ("page_layouts_id") REFERENCES "page_layouts"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_page_layouts_id_idx" ON "media_usages_rels" ("page_layouts_id");

    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "graphic_documents_id" uuid;
    DO $$ BEGIN ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_graphic_documents_fk" FOREIGN KEY ("graphic_documents_id") REFERENCES "graphic_documents"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_graphic_documents_id_idx" ON "media_usages_rels" ("graphic_documents_id");

    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "podcast_episodes_id" uuid;
    DO $$ BEGIN ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_podcast_episodes_fk" FOREIGN KEY ("podcast_episodes_id") REFERENCES "podcast_episodes"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_podcast_episodes_id_idx" ON "media_usages_rels" ("podcast_episodes_id");

    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "videos_id" uuid;
    DO $$ BEGIN ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "videos"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_videos_id_idx" ON "media_usages_rels" ("videos_id");

    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "social_network_variants_id" uuid;
    DO $$ BEGIN ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_social_network_variants_fk" FOREIGN KEY ("social_network_variants_id") REFERENCES "social_network_variants"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_social_network_variants_id_idx" ON "media_usages_rels" ("social_network_variants_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_social_network_variants_fk";
    DROP INDEX IF EXISTS "media_usages_rels_social_network_variants_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "social_network_variants_id";
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_videos_fk";
    DROP INDEX IF EXISTS "media_usages_rels_videos_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "videos_id";
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_podcast_episodes_fk";
    DROP INDEX IF EXISTS "media_usages_rels_podcast_episodes_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "podcast_episodes_id";
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_graphic_documents_fk";
    DROP INDEX IF EXISTS "media_usages_rels_graphic_documents_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "graphic_documents_id";
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_page_layouts_fk";
    DROP INDEX IF EXISTS "media_usages_rels_page_layouts_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "page_layouts_id";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_variants_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_variants_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_variants_id";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_blobs_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_blobs_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_blobs_id";
    ALTER TABLE "media_usages" DROP COLUMN IF EXISTS "approved_for_public";
    ALTER TABLE "media_usages" DROP COLUMN IF EXISTS "site_id";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "public_policy";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "processing_state";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "rights_expires_at";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "rights_source_url";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "original_filename";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "original_blob_id";
    DROP TABLE IF EXISTS "media_variants";
    DROP TABLE IF EXISTS "media_blobs";
  `)
}

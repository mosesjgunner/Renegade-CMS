import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "video_metadata" jsonb;
    ALTER TABLE "videos"
      ADD COLUMN IF NOT EXISTS "body" text,
      ADD COLUMN IF NOT EXISTS "visibility" varchar NOT NULL DEFAULT 'public',
      ADD COLUMN IF NOT EXISTS "rights" jsonb,
      ADD COLUMN IF NOT EXISTS "source_asset_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "poster_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "distribution_clips" jsonb;
    ALTER TABLE "videos" ALTER COLUMN "external_id" DROP NOT NULL;
    ALTER TABLE "videos" ALTER COLUMN "provider_identity" DROP NOT NULL;
    CREATE TABLE IF NOT EXISTS "video_assets" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "title" varchar NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "source_asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
      "processing_state" varchar NOT NULL DEFAULT 'uploaded', "recipe_key" varchar NOT NULL DEFAULT 'web-video-v1',
      "recipe_version" numeric NOT NULL DEFAULT 1, "metadata" jsonb, "outputs" jsonb, "last_good_outputs" jsonb,
      "progress" numeric DEFAULT 0, "attempts" numeric DEFAULT 0, "heartbeat_at" timestamptz,
      "failure" jsonb, "cancel_requested" boolean DEFAULT false, "updated_at" timestamptz NOT NULL DEFAULT now(), "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "video_assets_source_asset_idx" ON "video_assets" ("source_asset_id");
    CREATE INDEX IF NOT EXISTS "video_assets_site_idx" ON "video_assets" ("site_id");
    CREATE INDEX IF NOT EXISTS "video_assets_publication_idx" ON "video_assets" ("publication_id");
    CREATE INDEX IF NOT EXISTS "video_assets_space_idx" ON "video_assets" ("space_id");
    CREATE INDEX IF NOT EXISTS "video_assets_owner_idx" ON "video_assets" ("owner_id");
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "video_asset_id" uuid REFERENCES "video_assets"("id") ON DELETE SET NULL;
    CREATE TABLE IF NOT EXISTS "video_captions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "title" varchar NOT NULL,
      "video_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE CASCADE,
      "asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
      "language" varchar NOT NULL, "label" varchar NOT NULL, "default" boolean DEFAULT false,
      "kind" varchar NOT NULL DEFAULT 'subtitles', "validation" jsonb NOT NULL,
      "transcript_id" uuid REFERENCES "transcript_revisions"("id") ON DELETE SET NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now(), "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "video_captions_video_idx" ON "video_captions" ("video_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "video_assets_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_video_assets_fk" FOREIGN KEY ("video_assets_id") REFERENCES "video_assets"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_video_assets_id_idx" ON "payload_locked_documents_rels" ("video_assets_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "video_captions_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_video_captions_fk" FOREIGN KEY ("video_captions_id") REFERENCES "video_captions"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_video_captions_id_idx" ON "payload_locked_documents_rels" ("video_captions_id");
    ALTER TABLE "videos_rels" ADD COLUMN IF NOT EXISTS "authors_id" uuid REFERENCES "authors"("id") ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS "videos_rels_authors_id_idx" ON "videos_rels" ("authors_id");
    ALTER TABLE "videos_rels" ADD COLUMN IF NOT EXISTS "video_captions_id" uuid REFERENCES "video_captions"("id") ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS "videos_rels_video_captions_id_idx" ON "videos_rels" ("video_captions_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "videos_rels" DROP COLUMN IF EXISTS "video_captions_id";
    ALTER TABLE "videos_rels" DROP COLUMN IF EXISTS "authors_id";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_video_captions_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_video_captions_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "video_captions_id";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_video_assets_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_video_assets_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "video_assets_id";
    ALTER TABLE "videos" DROP COLUMN IF EXISTS "video_asset_id";
    DROP TABLE IF EXISTS "video_captions" CASCADE;
    DROP TABLE IF EXISTS "video_assets" CASCADE;
    ALTER TABLE "videos" DROP COLUMN IF EXISTS "distribution_clips", DROP COLUMN IF EXISTS "poster_id", DROP COLUMN IF EXISTS "source_asset_id", DROP COLUMN IF EXISTS "rights", DROP COLUMN IF EXISTS "visibility", DROP COLUMN IF EXISTS "body";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "video_metadata";
  `)
}

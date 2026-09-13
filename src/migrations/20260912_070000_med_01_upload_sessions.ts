import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** MED-01 durable resumable upload intent; staged bytes are deliberately not database blobs. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "media_upload_sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "filename" varchar NOT NULL, "title" varchar NOT NULL, "alt_text" varchar, "caption" varchar,
      "expected_size" numeric NOT NULL, "expected_checksum" varchar, "chunk_size" numeric NOT NULL,
      "received_bytes" numeric NOT NULL DEFAULT 0, "received_chunks" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "state" varchar NOT NULL DEFAULT 'open', "asset_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL,
      "expires_at" timestamptz NOT NULL, "failure_reason" varchar,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "media_upload_sessions_expiry_idx" ON "media_upload_sessions" ("expires_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_upload_sessions_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_upload_sessions_fk" FOREIGN KEY ("media_upload_sessions_id") REFERENCES "media_upload_sessions"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_upload_sessions_id_idx" ON "payload_locked_documents_rels" ("media_upload_sessions_id");
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_upload_sessions_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_upload_sessions_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_upload_sessions_id";
    DROP TABLE IF EXISTS "media_upload_sessions";
  `)
}

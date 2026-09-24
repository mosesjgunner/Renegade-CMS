import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-07C: private direct-storage message attachment metadata and quarantine state. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "message_attachments" (
    "id" uuid PRIMARY KEY, "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
    "owner_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
    "message_id" uuid REFERENCES "messages"("id") ON DELETE CASCADE,
    "storage_key" text NOT NULL UNIQUE, "original_filename" varchar(255) NOT NULL,
    "claimed_mime_type" varchar(100) NOT NULL CHECK ("claimed_mime_type" IN ('image/jpeg','image/png','image/webp','application/pdf')),
    "byte_size" integer NOT NULL CHECK ("byte_size" > 0 AND "byte_size" <= 10485760),
    "status" varchar(20) NOT NULL DEFAULT 'pending_scan' CHECK ("status" IN ('pending_scan','clean','quarantined','rejected')),
    "upload_expires_at" timestamp(3) with time zone NOT NULL, "scanned_at" timestamp(3) with time zone,
    "linked_at" timestamp(3) with time zone, "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS "message_attachments_orphan_cleanup_idx" ON "message_attachments" ("created_at") WHERE "message_id" IS NULL;
  CREATE INDEX IF NOT EXISTS "message_attachments_message_idx" ON "message_attachments" ("message_id");
`)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "message_attachments";`)
}

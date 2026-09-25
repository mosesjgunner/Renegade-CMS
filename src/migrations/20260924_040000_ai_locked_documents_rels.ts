import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "ai_connections_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_ai_connections_id_idx" ON "payload_locked_documents_rels" ("ai_connections_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "ai_credentials_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_ai_credentials_id_idx" ON "payload_locked_documents_rels" ("ai_credentials_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "ai_proposals_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_ai_proposals_id_idx" ON "payload_locked_documents_rels" ("ai_proposals_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "ai_connections_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "ai_credentials_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "ai_proposals_id";
  `)
}

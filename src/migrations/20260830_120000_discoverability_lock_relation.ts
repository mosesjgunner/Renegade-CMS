import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "public_redirects_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_public_redirects_fk" FOREIGN KEY ("public_redirects_id") REFERENCES "public_redirects"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_public_redirects_id_idx" ON "payload_locked_documents_rels" ("public_redirects_id");
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    `ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_public_redirects_fk"; DROP INDEX IF EXISTS "payload_locked_documents_rels_public_redirects_id_idx"; ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "public_redirects_id";`,
  )
}

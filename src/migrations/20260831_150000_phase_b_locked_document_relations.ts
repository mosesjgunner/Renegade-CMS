import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Reconciles lock-relation columns for Phase B collections on databases migrated before this fix. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "execution_events_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_execution_events_fk" FOREIGN KEY ("execution_events_id") REFERENCES "execution_events"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_execution_events_id_idx" ON "payload_locked_documents_rels" ("execution_events_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "analytics_consent_records_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_consent_records_fk" FOREIGN KEY ("analytics_consent_records_id") REFERENCES "analytics_consent_records"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_analytics_consent_records_id_idx" ON "payload_locked_documents_rels" ("analytics_consent_records_id");
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error('Phase B lock relations are additive; rollback requires a reviewed data migration.')
}

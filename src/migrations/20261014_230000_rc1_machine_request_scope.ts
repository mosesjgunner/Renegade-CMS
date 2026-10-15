import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'
/** Retain existing request receipts while binding new client-scoped keys to request bodies. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE api_request_records ADD COLUMN IF NOT EXISTS request_hash varchar;`,
  )
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM api_request_records WHERE request_hash IS NOT NULL) THEN
      RAISE EXCEPTION 'Request integrity receipts must be retained; restore the pre-migration backup to roll back.';
    END IF;
  END $$; ALTER TABLE api_request_records DROP COLUMN IF EXISTS request_hash;`)
}

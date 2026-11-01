import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

/** Ensure network UUID columns have default generators. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS network_relationships ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE IF EXISTS remote_objects ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE IF EXISTS network_access_decisions ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE IF EXISTS network_audit_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS network_relationships ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS remote_objects ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS network_access_decisions ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS network_audit_events ALTER COLUMN id DROP DEFAULT;
  `)
}


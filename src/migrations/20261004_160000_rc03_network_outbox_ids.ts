import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

/** Existing outbox rows are preserved; Payload UUID inserts require database defaults. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS remote_instances ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE IF EXISTS outbound_network_deliveries ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE IF EXISTS network_delivery_attempts ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS remote_instances ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS outbound_network_deliveries ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS network_delivery_attempts ALTER COLUMN id DROP DEFAULT;
  `)
}

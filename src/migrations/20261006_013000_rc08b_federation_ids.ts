import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

/** Protocol acceptance found that discovery/inbox UUID inserts had no defaults. Preserve rows. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS remote_actors ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE IF EXISTS inbound_network_activities ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS remote_actors ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS inbound_network_activities ALTER COLUMN id DROP DEFAULT;
  `)
}

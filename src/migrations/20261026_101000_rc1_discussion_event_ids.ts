import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

/** The registered collection uses the same database-generated UUID contract as other Payload records. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE realtime_events ALTER COLUMN id SET DEFAULT gen_random_uuid();`)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE realtime_events ALTER COLUMN id DROP DEFAULT;`)
}

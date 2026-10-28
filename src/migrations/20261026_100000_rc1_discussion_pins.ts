import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE discussions ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;`,
  )
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE discussions DROP COLUMN IF EXISTS pinned;`)
}

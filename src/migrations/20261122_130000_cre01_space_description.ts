import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "spaces" ADD COLUMN IF NOT EXISTS "creator_description" varchar;`,
  )
}

// Rolling back discards Space descriptions.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "spaces" DROP COLUMN IF EXISTS "creator_description";`)
}

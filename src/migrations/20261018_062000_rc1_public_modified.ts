import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "public_modified_at" timestamp(3) with time zone;`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "content" DROP COLUMN IF EXISTS "public_modified_at";`)
}

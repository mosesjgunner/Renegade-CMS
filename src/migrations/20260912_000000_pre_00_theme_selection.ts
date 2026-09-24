import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "theme_id" varchar DEFAULT 'neutral-starter';`,
  )
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "theme_id";`)
}

import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE experiments ADD COLUMN conversion_form_id uuid REFERENCES form_definitions(id); CREATE INDEX experiments_conversion_form_idx ON experiments(conversion_form_id);`,
  )
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE experiments DROP COLUMN conversion_form_id;`)
}

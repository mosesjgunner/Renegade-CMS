import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

/** The canonical collaboration tables already use UUIDs but lacked generation defaults. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE editorial_discussions ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE editorial_comments ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE team_audit_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE editorial_discussions ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE editorial_comments ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE team_audit_events ALTER COLUMN id DROP DEFAULT;
  `)
}

import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "required_entitlement" jsonb;`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM content WHERE required_entitlement IS NOT NULL) THEN
        RAISE EXCEPTION 'Cannot discard content entitlement policy; remove restrictions through the editor before rolling back.';
      END IF;
    END $$;
    ALTER TABLE "content" DROP COLUMN IF EXISTS "required_entitlement";
  `)
}

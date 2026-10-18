import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE editorial_comments ADD COLUMN IF NOT EXISTS review jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM editorial_comments WHERE review IS NOT NULL) THEN
      RAISE EXCEPTION 'Review comments must be retained; restore the pre-migration backup to roll back.';
    END IF;
  END $$;
  ALTER TABLE editorial_comments DROP COLUMN IF EXISTS review;`)
}

import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE enum_content_visibility AS ENUM ('public', 'unlisted', 'members', 'friends', 'private');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    ALTER TABLE content ADD COLUMN IF NOT EXISTS visibility enum_content_visibility NOT NULL DEFAULT 'public';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM content WHERE visibility <> 'public') THEN
        RAISE EXCEPTION 'Cannot discard content privacy policy; restore the pre-migration backup to roll back.';
      END IF;
    END $$;
    ALTER TABLE content DROP COLUMN IF EXISTS visibility;
    DROP TYPE IF EXISTS enum_content_visibility;
  `)
}

import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

/** Preserve existing calendar audits while supporting real editorial scheduling sources. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE calendar_entry_audits ADD COLUMN IF NOT EXISTS article_id uuid
      REFERENCES article_family_content(id) ON DELETE RESTRICT;
    ALTER TABLE calendar_entry_audits ALTER COLUMN calendar_entry_id DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS calendar_entry_audits_article_idx ON calendar_entry_audits(article_id);
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='calendar_entry_audits_source_required') THEN
        ALTER TABLE calendar_entry_audits ADD CONSTRAINT calendar_entry_audits_source_required
          CHECK (calendar_entry_id IS NOT NULL OR article_id IS NOT NULL);
      END IF;
    END $$;
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM calendar_entry_audits WHERE calendar_entry_id IS NULL) THEN
        RAISE EXCEPTION 'Editorial calendar audit rows must be retained; restore the pre-migration backup to roll back.';
      END IF;
    END $$;
    ALTER TABLE calendar_entry_audits DROP CONSTRAINT IF EXISTS calendar_entry_audits_source_required;
    ALTER TABLE calendar_entry_audits ALTER COLUMN calendar_entry_id SET NOT NULL;
    DROP INDEX IF EXISTS calendar_entry_audits_article_idx;
    ALTER TABLE calendar_entry_audits DROP COLUMN IF EXISTS article_id;
  `)
}

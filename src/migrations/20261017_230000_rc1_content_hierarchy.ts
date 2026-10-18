import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE sections ADD COLUMN IF NOT EXISTS canonical_path varchar;
    UPDATE sections SET canonical_path = '/sections/' || slug WHERE canonical_path IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS sections_site_canonical_path_idx ON sections(site_id, canonical_path);
    ALTER TABLE albums ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE RESTRICT;
    ALTER TABLE albums ADD COLUMN IF NOT EXISTS sort_order numeric DEFAULT 0;
    CREATE INDEX IF NOT EXISTS albums_category_idx ON albums(category_id);
    ALTER TABLE content ADD COLUMN IF NOT EXISTS sort_order numeric DEFAULT 0;
    ALTER TABLE content_rels ADD COLUMN IF NOT EXISTS albums_id uuid REFERENCES albums(id) ON DELETE RESTRICT;
    CREATE INDEX IF NOT EXISTS content_rels_albums_idx ON content_rels(albums_id);
    ALTER TABLE sections ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE categories ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE albums ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM albums WHERE category_id IS NOT NULL)
      OR EXISTS(SELECT 1 FROM content_rels WHERE albums_id IS NOT NULL)
      OR EXISTS(SELECT 1 FROM content WHERE sort_order <> 0)
      OR EXISTS(SELECT 1 FROM albums WHERE sort_order <> 0) THEN
      RAISE EXCEPTION 'Hierarchy relationships and ordering must be retained; restore the pre-migration backup to roll back.';
    END IF;
  END $$;
  DROP INDEX IF EXISTS content_rels_albums_idx;
  ALTER TABLE content_rels DROP COLUMN IF EXISTS albums_id;
  ALTER TABLE content DROP COLUMN IF EXISTS sort_order;
  DROP INDEX IF EXISTS albums_category_idx;
  ALTER TABLE albums DROP COLUMN IF EXISTS sort_order, DROP COLUMN IF EXISTS category_id;
  DROP INDEX IF EXISTS sections_site_canonical_path_idx;
  ALTER TABLE sections DROP COLUMN IF EXISTS canonical_path;`)
}

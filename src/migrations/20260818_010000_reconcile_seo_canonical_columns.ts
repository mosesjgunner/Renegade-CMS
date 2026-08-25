import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

const tables = ['content', 'events', 'timelines'] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const table of tables) {
    await db.execute(
      sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${table}' AND column_name = 'seo_canonical_url'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${table}' AND column_name = 'seo_canonical_u_r_l'
        ) THEN
          ALTER TABLE "${table}" RENAME COLUMN "seo_canonical_url" TO "seo_canonical_u_r_l";
        END IF;
      END $$;
    `),
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const table of tables) {
    await db.execute(
      sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${table}' AND column_name = 'seo_canonical_u_r_l'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${table}' AND column_name = 'seo_canonical_url'
        ) THEN
          ALTER TABLE "${table}" RENAME COLUMN "seo_canonical_u_r_l" TO "seo_canonical_url";
        END IF;
      END $$;
    `),
    )
  }
}

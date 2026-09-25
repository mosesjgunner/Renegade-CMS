import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Optional semantic URL templates; absent values retain the stable route defaults. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "site_settings"
      ADD COLUMN IF NOT EXISTS "semantic_route_templates" jsonb,
      ADD COLUMN IF NOT EXISTS "semantic_route_templates_by_site" jsonb;
    ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "canonical_path" varchar;
    CREATE UNIQUE INDEX IF NOT EXISTS "topics_site_canonical_path_idx"
      ON "topics" USING btree ("site_id", "canonical_path");
    DROP INDEX IF EXISTS "events_canonical_path_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "events_site_canonical_path_idx"
      ON "events" USING btree ("site_id", "canonical_path");
    DROP INDEX IF EXISTS "timelines_canonical_path_idx";
    ALTER TABLE "timelines" ALTER COLUMN "canonical_path" DROP NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "timelines_site_canonical_path_idx"
      ON "timelines" USING btree ("site_id", "canonical_path");
    DROP INDEX IF EXISTS "albums_canonical_path_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "albums_site_canonical_path_idx"
      ON "albums" USING btree ("site_id", "canonical_path");
    DROP INDEX IF EXISTS "discussions_canonical_path_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "discussions_site_canonical_path_idx"
      ON "discussions" USING btree ("site_id", "canonical_path");
    CREATE INDEX IF NOT EXISTS "content_site_canonical_path_idx"
      ON "content" USING btree ("site_id", "canonical_path");
    CREATE INDEX IF NOT EXISTS "books_site_canonical_path_idx"
      ON "books" USING btree ("site_id", "canonical_path");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "site_settings"
      DROP COLUMN IF EXISTS "semantic_route_templates_by_site",
      DROP COLUMN IF EXISTS "semantic_route_templates";
    DROP INDEX IF EXISTS "books_site_canonical_path_idx";
    DROP INDEX IF EXISTS "content_site_canonical_path_idx";
    DROP INDEX IF EXISTS "discussions_site_canonical_path_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "discussions_canonical_path_idx"
      ON "discussions" USING btree ("canonical_path");
    DROP INDEX IF EXISTS "albums_site_canonical_path_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "albums_canonical_path_idx"
      ON "albums" USING btree ("canonical_path");
    DROP INDEX IF EXISTS "timelines_site_canonical_path_idx";
    ALTER TABLE "timelines" ALTER COLUMN "canonical_path" SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "timelines_canonical_path_idx"
      ON "timelines" USING btree ("canonical_path");
    DROP INDEX IF EXISTS "events_site_canonical_path_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "events_canonical_path_idx"
      ON "events" USING btree ("canonical_path");
    DROP INDEX IF EXISTS "topics_site_canonical_path_idx";
    ALTER TABLE "topics" DROP COLUMN IF EXISTS "canonical_path";
  `)
}

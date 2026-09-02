import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * PUB-01 makes Site the non-negotiable tenant root for the canonical
 * publishing hierarchy. Existing records are only backfilled when their
 * publication relation proves the owning site (or when the installation has
 * exactly one site); ambiguous records deliberately stop the migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "site_id" uuid;
    ALTER TABLE "spaces" ADD COLUMN IF NOT EXISTS "site_id" uuid;

    UPDATE "brands" AS brand
    SET "site_id" = (
      SELECT publication."site_id"
      FROM "publications" AS publication
      WHERE publication."brand_id" = brand."id"
      ORDER BY publication."created_at", publication."id"
      LIMIT 1
    )
    WHERE brand."site_id" IS NULL
      AND EXISTS (SELECT 1 FROM "publications" WHERE "brand_id" = brand."id");

    UPDATE "spaces" AS space
    SET "site_id" = (
      SELECT publication."site_id"
      FROM "publications" AS publication
      WHERE publication."space_id" = space."id"
      ORDER BY publication."created_at", publication."id"
      LIMIT 1
    )
    WHERE space."site_id" IS NULL
      AND EXISTS (SELECT 1 FROM "publications" WHERE "space_id" = space."id");

    UPDATE "brands"
    SET "site_id" = (SELECT "id" FROM "sites" LIMIT 1)
    WHERE "site_id" IS NULL AND (SELECT count(*) FROM "sites") = 1;
    UPDATE "spaces"
    SET "site_id" = (SELECT "id" FROM "sites" LIMIT 1)
    WHERE "site_id" IS NULL AND (SELECT count(*) FROM "sites") = 1;

    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "brands" WHERE "site_id" IS NULL)
        OR EXISTS (SELECT 1 FROM "spaces" WHERE "site_id" IS NULL) THEN
        RAISE EXCEPTION 'PUB-01 cannot infer a tenant site for every brand and space; assign their site before migrating.';
      END IF;
    END $$;

    ALTER TABLE "brands" ALTER COLUMN "site_id" SET NOT NULL;
    ALTER TABLE "spaces" ALTER COLUMN "site_id" SET NOT NULL;
    DO $$ BEGIN
      ALTER TABLE "brands" ADD CONSTRAINT "brands_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "spaces" ADD CONSTRAINT "spaces_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DROP INDEX IF EXISTS "spaces_handle_idx";
    DROP INDEX IF EXISTS "spaces_canonical_path_idx";
    CREATE INDEX IF NOT EXISTS "brands_site_idx" ON "brands" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "spaces_site_idx" ON "spaces" USING btree ("site_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "spaces_site_handle_idx" ON "spaces" USING btree ("site_id", "handle");
    CREATE UNIQUE INDEX IF NOT EXISTS "spaces_site_canonical_path_idx" ON "spaces" USING btree ("site_id", "canonical_path");
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    'PUB-01 establishes tenant ownership; restore from a reviewed backup to roll back.',
  )
}

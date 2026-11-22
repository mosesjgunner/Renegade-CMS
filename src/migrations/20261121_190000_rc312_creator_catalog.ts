import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * RC3-12: creator career catalog (non-podcast slice).
 *
 * A creator's body of work is staged from a versioned manifest before
 * anything is written: every item carries a durable key, provenance,
 * consent/rights status and a checksum, and the staging verdict
 * (ready / review / blocked, with actionable reasons) is persisted on
 * the import run. Series and items keep listing policy SEPARATE from
 * access policy — an item can be listed-but-member-only or entirely
 * unlisted — so the public listing/search projection can filter
 * private entries before ranking, facets or snippets ever see them.
 * Podcast episode/feed machinery is NOT here: it rides RC3-10/11.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "creator_catalog_series" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "creator_member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "slug" varchar(160) NOT NULL,
      "title" varchar(300) NOT NULL,
      "description" text,
      "listing_policy" varchar(12) NOT NULL DEFAULT 'listed' CHECK ("listing_policy" IN ('listed','unlisted')),
      "access_policy" varchar(12) NOT NULL DEFAULT 'free' CHECK ("access_policy" IN ('free','member')),
      "provenance" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "checksum" varchar(64) NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "creator_catalog_series_site_slug_unique" UNIQUE ("site_id", "slug")
    );
    CREATE INDEX IF NOT EXISTS "creator_catalog_series_site_idx" ON "creator_catalog_series" ("site_id", "listing_policy");

    CREATE TABLE IF NOT EXISTS "creator_catalog_items" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "series_id" uuid NOT NULL REFERENCES "creator_catalog_series"("id") ON DELETE CASCADE,
      "season_number" integer,
      "position" integer NOT NULL DEFAULT 0,
      "kind" varchar(16) NOT NULL CHECK ("kind" IN ('article','video','audio','gallery','link')),
      "title" varchar(300) NOT NULL,
      "slug" varchar(160) NOT NULL,
      "legacy_url" text,
      "work_ref_collection" varchar(80),
      "work_ref_id" varchar(120),
      "transcript" text,
      "variants" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "listing_policy" varchar(12) NOT NULL DEFAULT 'listed' CHECK ("listing_policy" IN ('listed','unlisted')),
      "access_policy" varchar(12) NOT NULL DEFAULT 'free' CHECK ("access_policy" IN ('free','member')),
      "rights_status" varchar(16) NOT NULL DEFAULT 'owned' CHECK ("rights_status" IN ('owned','licensed','unknown')),
      "consent_status" varchar(16) NOT NULL DEFAULT 'not-required' CHECK ("consent_status" IN ('granted','not-required','missing')),
      "durable_key" varchar(240) NOT NULL,
      "provenance" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "checksum" varchar(64) NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "creator_catalog_items_site_durable_unique" UNIQUE ("site_id", "durable_key"),
      CONSTRAINT "creator_catalog_items_series_slug_unique" UNIQUE ("series_id", "slug")
    );
    CREATE INDEX IF NOT EXISTS "creator_catalog_items_series_idx" ON "creator_catalog_items" ("series_id", "season_number", "position");
    CREATE INDEX IF NOT EXISTS "creator_catalog_items_site_listing_idx" ON "creator_catalog_items" ("site_id", "listing_policy", "access_policy");

    CREATE TABLE IF NOT EXISTS "creator_catalog_import_runs" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "actor_member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "manifest_checksum" varchar(64) NOT NULL,
      "manifest" jsonb NOT NULL,
      "state" varchar(24) NOT NULL DEFAULT 'staged' CHECK ("state" IN ('staged','partially-applied','applied')),
      "report" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "creator_catalog_import_runs_site_checksum_unique" UNIQUE ("site_id", "manifest_checksum")
    );
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "creator_catalog_import_runs";
    DROP TABLE IF EXISTS "creator_catalog_items";
    DROP TABLE IF EXISTS "creator_catalog_series";
  `)
}

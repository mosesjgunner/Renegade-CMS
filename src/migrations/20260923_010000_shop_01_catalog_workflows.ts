import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** SHOP-01 catalog fields and private delivery/import audit records. Additive and replay-safe. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Correct malformed UUIDv7 output for databases that already applied the
    -- original community migration. UUID fields require the canonical 8-4-4-4-12 layout.
    CREATE OR REPLACE FUNCTION "renegade_uuid_v7"() RETURNS uuid
    LANGUAGE sql VOLATILE AS $$
      WITH parts AS (
        SELECT
          lpad(to_hex(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint), 12, '0') AS ts,
          encode(gen_random_bytes(10), 'hex') AS random_hex
      )
      SELECT (
        substr(ts, 1, 8) || '-' || substr(ts, 9, 4) ||
        '-7' || substr(random_hex, 1, 3) ||
        '-8' || substr(random_hex, 4, 3) ||
        '-' || substr(random_hex, 7, 12)
      )::uuid
      FROM parts;
    $$;

    -- The current Site configuration owns this array relation. Older baseline
    -- snapshots predate it, so install it before a production runtime reads
    -- Site records (including the storefront host resolver).
    CREATE TABLE IF NOT EXISTS "sites_comment_reaction_codes" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "parent_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "value" varchar NOT NULL,
      "order" integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS "sites_comment_reaction_codes_parent_idx"
      ON "sites_comment_reaction_codes" ("parent_id");

    ALTER TYPE "enum_products_kind" ADD VALUE IF NOT EXISTS 'donation';
    ALTER TYPE "enum_products_kind" ADD VALUE IF NOT EXISTS 'affiliate';
    ALTER TYPE "enum_products_variants_inventory_policy" ADD VALUE IF NOT EXISTS 'affiliate';
    ALTER TYPE "enum_products_variants_inventory_policy" ADD VALUE IF NOT EXISTS 'pod';
    DO $$ BEGIN CREATE TYPE "enum_products_variants_status" AS ENUM ('active', 'unavailable', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "enum_digital_download_events_outcome" AS ENUM ('allowed', 'denied'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "enum_catalog_import_runs_mode" AS ENUM ('dry-run', 'apply'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "enum_catalog_import_runs_status" AS ENUM ('planned', 'applied', 'replayed', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE "products" ALTER COLUMN "merchant_connection_id" DROP NOT NULL;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "catalog_contract_version" numeric DEFAULT 1 NOT NULL;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "summary" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "archived_at" timestamp(3) with time zone;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "redirect_to" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "option_dimensions" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "offers" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "digital_delivery" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "affiliate_policy" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pod_mappings" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "disclosures" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "workflow_audit" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "revision_snapshots" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "published_presentation" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_title" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_description" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_canonical_u_r_l" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_image_alt" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_keywords" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_focus_keyphrase" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_no_index" boolean DEFAULT false;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    DROP INDEX IF EXISTS "products_canonical_path_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "products_site_slug_idx" ON "products" ("site_id", "slug");
    CREATE UNIQUE INDEX IF NOT EXISTS "products_site_canonical_path_idx" ON "products" ("site_id", "canonical_path");

    ALTER TABLE "products_variants" ADD COLUMN IF NOT EXISTS "option_values" jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE "products_variants" ADD COLUMN IF NOT EXISTS "status" "enum_products_variants_status" DEFAULT 'active';
    ALTER TABLE "products_variants" ADD COLUMN IF NOT EXISTS "weight_grams" numeric;
    ALTER TABLE "products_variants" ADD COLUMN IF NOT EXISTS "dimensions_mm" jsonb;

    ALTER TABLE "products_rels" ADD COLUMN IF NOT EXISTS "topics_id" uuid;
    ALTER TABLE "products_rels" ADD COLUMN IF NOT EXISTS "tags_id" uuid;
    ALTER TABLE "products_rels" ADD COLUMN IF NOT EXISTS "products_id" uuid;
    DO $$ BEGIN ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "topics"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "tags"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "products"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "products_rels_topics_id_idx" ON "products_rels" ("topics_id");
    CREATE INDEX IF NOT EXISTS "products_rels_tags_id_idx" ON "products_rels" ("tags_id");
    CREATE INDEX IF NOT EXISTS "products_rels_products_id_idx" ON "products_rels" ("products_id");

    CREATE TABLE IF NOT EXISTS "digital_delivery_grants" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE set null, "space_id" uuid REFERENCES "spaces"("id") ON DELETE set null,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE set null, "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE restrict,
      "variant_sku" varchar NOT NULL, "entitlement_id" uuid NOT NULL REFERENCES "entitlements"("id") ON DELETE restrict,
      "member_id" uuid REFERENCES "members"("id") ON DELETE set null, "media_asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE restrict,
      "grant_key_hash" varchar NOT NULL, "download_limit" numeric, "download_count" numeric DEFAULT 0 NOT NULL,
      "expires_at" timestamp(3) with time zone, "revoked_at" timestamp(3) with time zone, "last_downloaded_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "digital_delivery_grants_grant_key_hash_unique" UNIQUE ("grant_key_hash")
    );
    CREATE INDEX IF NOT EXISTS "digital_delivery_grants_site_idx" ON "digital_delivery_grants" ("site_id");
    CREATE INDEX IF NOT EXISTS "digital_delivery_grants_member_idx" ON "digital_delivery_grants" ("member_id");

    CREATE TABLE IF NOT EXISTS "digital_download_events" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE set null, "space_id" uuid REFERENCES "spaces"("id") ON DELETE set null,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE set null, "grant_id" uuid NOT NULL REFERENCES "digital_delivery_grants"("id") ON DELETE restrict,
      "media_asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE restrict, "occurred_at" timestamp(3) with time zone NOT NULL,
      "outcome" "enum_digital_download_events_outcome" NOT NULL, "reason" varchar, "request_fingerprint" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "digital_download_events_site_idx" ON "digital_download_events" ("site_id");
    CREATE INDEX IF NOT EXISTS "digital_download_events_grant_idx" ON "digital_download_events" ("grant_id");

    CREATE TABLE IF NOT EXISTS "catalog_import_runs" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE set null, "space_id" uuid REFERENCES "spaces"("id") ON DELETE set null,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE set null, "checksum" varchar NOT NULL, "mode" "enum_catalog_import_runs_mode" NOT NULL,
      "status" "enum_catalog_import_runs_status" NOT NULL, "source" varchar NOT NULL, "summary" jsonb NOT NULL, "applied_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "catalog_import_runs_site_checksum_mode_unique" UNIQUE ("site_id", "checksum", "mode")
    );
    CREATE INDEX IF NOT EXISTS "catalog_import_runs_site_idx" ON "catalog_import_runs" ("site_id");
    CREATE INDEX IF NOT EXISTS "catalog_import_runs_checksum_idx" ON "catalog_import_runs" ("checksum");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "catalog_import_runs";
    DROP TABLE IF EXISTS "digital_download_events";
    DROP TABLE IF EXISTS "digital_delivery_grants";
    ALTER TABLE "products_rels" DROP COLUMN IF EXISTS "products_id", DROP COLUMN IF EXISTS "tags_id", DROP COLUMN IF EXISTS "topics_id";
    ALTER TABLE "products_variants" DROP COLUMN IF EXISTS "dimensions_mm", DROP COLUMN IF EXISTS "weight_grams", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "option_values";
    ALTER TABLE "products" DROP COLUMN IF EXISTS "discovery_overrides", DROP COLUMN IF EXISTS "seo_no_index", DROP COLUMN IF EXISTS "seo_focus_keyphrase", DROP COLUMN IF EXISTS "seo_keywords", DROP COLUMN IF EXISTS "seo_image_alt", DROP COLUMN IF EXISTS "seo_canonical_u_r_l", DROP COLUMN IF EXISTS "seo_description", DROP COLUMN IF EXISTS "seo_title", DROP COLUMN IF EXISTS "published_presentation", DROP COLUMN IF EXISTS "revision_snapshots", DROP COLUMN IF EXISTS "workflow_audit", DROP COLUMN IF EXISTS "disclosures", DROP COLUMN IF EXISTS "pod_mappings", DROP COLUMN IF EXISTS "affiliate_policy", DROP COLUMN IF EXISTS "digital_delivery", DROP COLUMN IF EXISTS "offers", DROP COLUMN IF EXISTS "option_dimensions", DROP COLUMN IF EXISTS "product_capabilities", DROP COLUMN IF EXISTS "redirect_to", DROP COLUMN IF EXISTS "archived_at", DROP COLUMN IF EXISTS "published_at", DROP COLUMN IF EXISTS "summary", DROP COLUMN IF EXISTS "catalog_contract_version";
    DROP INDEX IF EXISTS "products_site_canonical_path_idx";
    DROP INDEX IF EXISTS "products_site_slug_idx";
    CREATE INDEX IF NOT EXISTS "products_canonical_path_idx" ON "products" ("canonical_path");
    DROP TYPE IF EXISTS "enum_catalog_import_runs_status";
    DROP TYPE IF EXISTS "enum_catalog_import_runs_mode";
    DROP TYPE IF EXISTS "enum_digital_download_events_outcome";
    DROP TYPE IF EXISTS "enum_products_variants_status";
  `)
}

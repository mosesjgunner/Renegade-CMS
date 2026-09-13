import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** MED-02: DAM metadata, immutable replacement audit, and a queryable usage graph. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "description" varchar,
      ADD COLUMN IF NOT EXISTS "creator_credit" varchar,
      ADD COLUMN IF NOT EXISTS "source" varchar,
      ADD COLUMN IF NOT EXISTS "copyright_owner" varchar,
      ADD COLUMN IF NOT EXISTS "license_type" varchar,
      ADD COLUMN IF NOT EXISTS "license_url" varchar,
      ADD COLUMN IF NOT EXISTS "embargo_until" timestamptz,
      ADD COLUMN IF NOT EXISTS "usage_restrictions" varchar,
      ADD COLUMN IF NOT EXISTS "governance_enabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "consent_reference" varchar,
      ADD COLUMN IF NOT EXISTS "model_release_reference" varchar,
      ADD COLUMN IF NOT EXISTS "property_release_reference" varchar,
      ADD COLUMN IF NOT EXISTS "custom_metadata" jsonb;
    ALTER TABLE "media_usages"
      ADD COLUMN IF NOT EXISTS "target_type" varchar NOT NULL DEFAULT 'content',
      ADD COLUMN IF NOT EXISTS "target_id" varchar,
      ADD COLUMN IF NOT EXISTS "target_revision" varchar,
      ADD COLUMN IF NOT EXISTS "field" varchar,
      ADD COLUMN IF NOT EXISTS "slot" varchar,
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "channel" varchar,
      ADD COLUMN IF NOT EXISTS "lifecycle" varchar NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS "last_reconciled_at" timestamptz;
    UPDATE "media_usages" SET "target_id" = COALESCE("target_id", "usage_key") WHERE "target_id" IS NULL;
    ALTER TABLE "media_usages" ALTER COLUMN "target_id" SET NOT NULL;
    CREATE INDEX IF NOT EXISTS "media_usages_graph_idx" ON "media_usages" ("site_id", "media_id", "lifecycle");
    CREATE TABLE IF NOT EXISTS "media_asset_versions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
      "replaces_asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
      "version_label" varchar NOT NULL, "mode" varchar NOT NULL,
      "replaced_usage_ids" jsonb, "impact_count" numeric NOT NULL DEFAULT 0, "reason" varchar,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "media_asset_versions_asset_idx" ON "media_asset_versions" ("asset_id");

    CREATE TABLE IF NOT EXISTS "media_governance_incidents" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
      "summary" varchar NOT NULL, "reason" varchar NOT NULL, "status" varchar NOT NULL DEFAULT 'open',
      "affected_usage_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "opened_at" timestamptz NOT NULL, "resolved_at" timestamptz, "resolution" varchar,
      "audit" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "media_governance_incidents_open_idx" ON "media_governance_incidents" ("site_id", "status");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_asset_versions_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_asset_versions_fk" FOREIGN KEY ("media_asset_versions_id") REFERENCES "media_asset_versions"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_asset_versions_id_idx" ON "payload_locked_documents_rels" ("media_asset_versions_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_governance_incidents_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_governance_incidents_fk" FOREIGN KEY ("media_governance_incidents_id") REFERENCES "media_governance_incidents"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_governance_incidents_id_idx" ON "payload_locked_documents_rels" ("media_governance_incidents_id");
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_governance_incidents_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_governance_incidents_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_governance_incidents_id";

    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_asset_versions_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_asset_versions_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_asset_versions_id";

    DROP INDEX IF EXISTS "media_governance_incidents_open_idx";
    DROP TABLE IF EXISTS "media_governance_incidents";
    DROP TABLE IF EXISTS "media_asset_versions";
    DROP INDEX IF EXISTS "media_usages_graph_idx";
    ALTER TABLE "media_usages" DROP COLUMN IF EXISTS "last_reconciled_at", DROP COLUMN IF EXISTS "lifecycle", DROP COLUMN IF EXISTS "channel", DROP COLUMN IF EXISTS "publication_id", DROP COLUMN IF EXISTS "slot", DROP COLUMN IF EXISTS "field", DROP COLUMN IF EXISTS "target_revision", DROP COLUMN IF EXISTS "target_id", DROP COLUMN IF EXISTS "target_type";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "custom_metadata", DROP COLUMN IF EXISTS "property_release_reference", DROP COLUMN IF EXISTS "model_release_reference", DROP COLUMN IF EXISTS "consent_reference", DROP COLUMN IF EXISTS "governance_enabled", DROP COLUMN IF EXISTS "usage_restrictions", DROP COLUMN IF EXISTS "embargo_until", DROP COLUMN IF EXISTS "license_url", DROP COLUMN IF EXISTS "license_type", DROP COLUMN IF EXISTS "copyright_owner", DROP COLUMN IF EXISTS "source", DROP COLUMN IF EXISTS "creator_credit", DROP COLUMN IF EXISTS "description";
  `)
}

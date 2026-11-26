import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * RC3-CE — Creator Earnings Engine schema.
 *
 * Additive only: fifteen monetization collections plus two new
 * canonical product kinds (`service`, `license`). No existing table,
 * column or row is altered. Money columns are varchar integer minor
 * units, matching the Commerce convention; an empty money column
 * means unknown, never zero. Hand-written in the house style because
 * the schema generator prompts interactively in this environment.
 */

const TABLES = [
  'monetization_profiles',
  'provider_connections',
  'external_revenue_evidence',
  'sponsor_advertisers',
  'sponsor_inventory',
  'sponsor_bookings',
  'representation_agreements',
  'ad_placements',
  'ad_deliveries',
  'rights_records',
  'license_offers',
  'license_grants',
  'service_slots',
  'service_bookings',
  'distribution_submissions',
] as const

const OWNER_COLUMNS = `
  "site_id" uuid NOT NULL,
  "publication_id" uuid,
  "space_id" uuid,
  "owner_id" uuid,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
`

function ownerFks(table: string): string {
  return `
  DO $$ BEGIN
    ALTER TABLE "${table}" ADD CONSTRAINT "${table}_site_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    ALTER TABLE "${table}" ADD CONSTRAINT "${table}_publication_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    ALTER TABLE "${table}" ADD CONSTRAINT "${table}_space_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    ALTER TABLE "${table}" ADD CONSTRAINT "${table}_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
}

function fk(table: string, column: string, target: string): string {
  return `
  DO $$ BEGIN
    ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${column}_fk" FOREIGN KEY ("${column}") REFERENCES "public"."${target}"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
}

function relsColumn(slug: string): string {
  const column = slug.replace(/-/g, '_') + '_id'
  return `
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "${column}" uuid;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_${column}_fk" FOREIGN KEY ("${column}") REFERENCES "public"."${slug.replace(/-/g, '_')}"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_${column}_idx" ON "payload_locked_documents_rels" USING btree ("${column}");`
}

const SLUGS = [
  'monetization-profiles',
  'provider-connections',
  'external-revenue-evidence',
  'sponsor-advertisers',
  'sponsor-inventory',
  'sponsor-bookings',
  'representation-agreements',
  'ad-placements',
  'ad-deliveries',
  'rights-records',
  'license-offers',
  'license-grants',
  'service-slots',
  'service-bookings',
  'distribution-submissions',
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
  ALTER TYPE "enum_products_kind" ADD VALUE IF NOT EXISTS 'service';
  ALTER TYPE "enum_products_kind" ADD VALUE IF NOT EXISTS 'license';

  CREATE TABLE IF NOT EXISTS "monetization_profiles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "status" varchar DEFAULT 'not-started',
    "seller_of_record_mode" varchar DEFAULT 'self-hosted-direct',
    "rails_enabled" jsonb DEFAULT '{}'::jsonb,
    "preferences" jsonb DEFAULT '{}'::jsonb,
    "category_exclusions" jsonb DEFAULT '[]'::jsonb,
    "max_ad_load_percent" numeric,
    "network_opt_in" jsonb DEFAULT '{}'::jsonb,
    "tax_disclosure_version" varchar,
    "consent_version" varchar
  );
  ${ownerFks('monetization_profiles')}
  CREATE UNIQUE INDEX IF NOT EXISTS "monetization_profiles_site_idx" ON "monetization_profiles" USING btree ("site_id");

  CREATE TABLE IF NOT EXISTS "provider_connections" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "provider_id" varchar NOT NULL,
    "account_ref" varchar,
    "credential_reference" varchar,
    "status" varchar DEFAULT 'not-configured',
    "granted_scopes" jsonb DEFAULT '[]'::jsonb,
    "evidence_by_capability" jsonb DEFAULT '{}'::jsonb,
    "last_success_at" timestamptz(6),
    "expires_at" timestamptz(6),
    "revoked_at" timestamptz(6),
    "authorized_purpose" varchar,
    "last_error" varchar
  );
  ${ownerFks('provider_connections')}
  CREATE UNIQUE INDEX IF NOT EXISTS "provider_connections_site_provider_account_idx" ON "provider_connections" USING btree ("site_id", "provider_id", "account_ref");

  CREATE TABLE IF NOT EXISTS "external_revenue_evidence" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "provider_id" varchar NOT NULL,
    "account_ref" varchar,
    "program_ref" varchar,
    "provider_event_id" varchar NOT NULL,
    "source_hash" varchar,
    "source_type" varchar DEFAULT 'manual',
    "status" varchar DEFAULT 'reported-estimated',
    "original_status" varchar,
    "currency" varchar NOT NULL,
    "gross_minor" varchar,
    "commission_minor" varchar,
    "fees_minor" varchar,
    "net_minor" varchar,
    "is_estimated" boolean DEFAULT true,
    "reversal_ref" varchar,
    "payout_ref" varchar,
    "mapping_version" varchar NOT NULL,
    "source_timestamp" timestamptz(6),
    "imported_at" timestamptz(6),
    "last_confirmed_at" timestamptz(6)
  );
  ${ownerFks('external_revenue_evidence')}
  CREATE UNIQUE INDEX IF NOT EXISTS "external_revenue_evidence_site_provider_event_idx" ON "external_revenue_evidence" USING btree ("site_id", "provider_id", "provider_event_id");

  CREATE TABLE IF NOT EXISTS "sponsor_advertisers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "name" varchar NOT NULL,
    "contact_name" varchar,
    "contact_email" varchar,
    "website" varchar,
    "status" varchar DEFAULT 'active',
    "notes" varchar
  );
  ${ownerFks('sponsor_advertisers')}

  CREATE TABLE IF NOT EXISTS "sponsor_inventory" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "name" varchar NOT NULL,
    "surface" varchar DEFAULT 'web',
    "placement_key" varchar,
    "units_total" numeric,
    "rate_minor" varchar,
    "currency" varchar NOT NULL,
    "pricing_model" varchar DEFAULT 'flat',
    "available_from" timestamptz(6),
    "available_to" timestamptz(6),
    "status" varchar DEFAULT 'draft',
    "audience_snapshot" jsonb DEFAULT '{}'::jsonb,
    "exclusions" jsonb DEFAULT '[]'::jsonb
  );
  ${ownerFks('sponsor_inventory')}

  CREATE TABLE IF NOT EXISTS "representation_agreements" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "version" varchar NOT NULL,
    "status" varchar DEFAULT 'draft',
    "commission_basis_bps" numeric,
    "carveouts" jsonb DEFAULT '[]'::jsonb,
    "exclusions" jsonb DEFAULT '[]'::jsonb,
    "territory" jsonb DEFAULT '[]'::jsonb,
    "signed_at" timestamptz(6),
    "revoked_at" timestamptz(6),
    "starts_at" timestamptz(6),
    "ends_at" timestamptz(6)
  );
  ${ownerFks('representation_agreements')}

  CREATE TABLE IF NOT EXISTS "sponsor_bookings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "inventory_id" uuid NOT NULL,
    "advertiser_id" uuid NOT NULL,
    "state" varchar DEFAULT 'inquiry',
    "price_minor" varchar,
    "currency" varchar NOT NULL,
    "io_version" varchar,
    "creative_versions" jsonb DEFAULT '[]'::jsonb,
    "creative_status" varchar DEFAULT 'none',
    "proof" jsonb DEFAULT '{}'::jsonb,
    "invoice_state" varchar DEFAULT 'none',
    "collected_minor" varchar,
    "representation_agreement_id" uuid,
    "agency_fee_minor" varchar,
    "starts_at" timestamptz(6),
    "ends_at" timestamptz(6),
    "hold_expires_at" timestamptz(6),
    "notes" varchar
  );
  ${ownerFks('sponsor_bookings')}
  ${fk('sponsor_bookings', 'inventory_id', 'sponsor_inventory')}
  ${fk('sponsor_bookings', 'advertiser_id', 'sponsor_advertisers')}
  ${fk('sponsor_bookings', 'representation_agreement_id', 'representation_agreements')}

  CREATE TABLE IF NOT EXISTS "ad_placements" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "name" varchar NOT NULL,
    "slot" varchar DEFAULT 'web-in-content',
    "kind" varchar DEFAULT 'house',
    "booking_id" uuid,
    "provider_id" varchar,
    "tag_reference" varchar,
    "content" jsonb DEFAULT '{}'::jsonb,
    "starts_at" timestamptz(6),
    "ends_at" timestamptz(6),
    "frequency_cap_per_day" numeric,
    "category_exclusions" jsonb DEFAULT '[]'::jsonb,
    "exclude_paid_content" boolean DEFAULT true,
    "requires_consent" boolean DEFAULT false,
    "status" varchar DEFAULT 'draft'
  );
  ${ownerFks('ad_placements')}
  ${fk('ad_placements', 'booking_id', 'sponsor_bookings')}

  CREATE TABLE IF NOT EXISTS "ad_deliveries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "placement_id" uuid NOT NULL,
    "slot" varchar NOT NULL,
    "kind" varchar DEFAULT 'house',
    "reason" varchar,
    "context" jsonb DEFAULT '{}'::jsonb,
    "delivered_at" timestamptz(6)
  );
  ${ownerFks('ad_deliveries')}
  ${fk('ad_deliveries', 'placement_id', 'ad_placements')}
  CREATE INDEX IF NOT EXISTS "ad_deliveries_placement_delivered_idx" ON "ad_deliveries" USING btree ("placement_id", "delivered_at");

  CREATE TABLE IF NOT EXISTS "rights_records" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "media_asset_id" uuid,
    "fingerprint" varchar NOT NULL,
    "basis" varchar DEFAULT 'unclear',
    "holders" jsonb DEFAULT '[]'::jsonb,
    "releases" jsonb DEFAULT '{}'::jsonb,
    "grantable" jsonb DEFAULT '{}'::jsonb,
    "restrictions" jsonb DEFAULT '{}'::jsonb,
    "status" varchar DEFAULT 'draft',
    "expires_at" timestamptz(6),
    "ai_tdm_opt_in" boolean DEFAULT false,
    "ai_tdm_terms_version" varchar
  );
  ${ownerFks('rights_records')}
  ${fk('rights_records', 'media_asset_id', 'media_assets')}
  CREATE UNIQUE INDEX IF NOT EXISTS "rights_records_site_fingerprint_idx" ON "rights_records" USING btree ("site_id", "fingerprint");

  CREATE TABLE IF NOT EXISTS "license_offers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "rights_record_id" uuid NOT NULL,
    "product_id" uuid,
    "name" varchar NOT NULL,
    "terms" jsonb DEFAULT '{}'::jsonb,
    "price_minor" varchar,
    "currency" varchar NOT NULL,
    "status" varchar DEFAULT 'draft',
    "agreement_version" varchar NOT NULL
  );
  ${ownerFks('license_offers')}
  ${fk('license_offers', 'rights_record_id', 'rights_records')}
  ${fk('license_offers', 'product_id', 'products')}

  CREATE TABLE IF NOT EXISTS "license_grants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "offer_id" uuid NOT NULL,
    "order_id" uuid,
    "buyer_name" varchar,
    "buyer_email" varchar,
    "agreement_version" varchar NOT NULL,
    "fingerprint" varchar NOT NULL,
    "terms_snapshot" jsonb DEFAULT '{}'::jsonb,
    "status" varchar DEFAULT 'issued',
    "issued_at" timestamptz(6),
    "delivered_at" timestamptz(6),
    "expires_at" timestamptz(6),
    "delivery_token_hash" varchar
  );
  ${ownerFks('license_grants')}
  ${fk('license_grants', 'offer_id', 'license_offers')}
  ${fk('license_grants', 'order_id', 'orders')}

  CREATE TABLE IF NOT EXISTS "service_slots" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "product_id" uuid NOT NULL,
    "starts_at" timestamptz(6),
    "ends_at" timestamptz(6),
    "timezone" varchar,
    "capacity" numeric,
    "booked_count" numeric DEFAULT 0,
    "status" varchar DEFAULT 'open'
  );
  ${ownerFks('service_slots')}
  ${fk('service_slots', 'product_id', 'products')}

  CREATE TABLE IF NOT EXISTS "service_bookings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "slot_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "order_id" uuid,
    "buyer_name" varchar,
    "buyer_email" varchar,
    "seats" numeric,
    "state" varchar DEFAULT 'reserved',
    "notes" varchar
  );
  ${ownerFks('service_bookings')}
  ${fk('service_bookings', 'slot_id', 'service_slots')}
  ${fk('service_bookings', 'product_id', 'products')}
  ${fk('service_bookings', 'order_id', 'orders')}

  CREATE TABLE IF NOT EXISTS "distribution_submissions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    ${OWNER_COLUMNS}
    "provider_id" varchar NOT NULL,
    "rights_record_id" uuid,
    "content_ref" varchar,
    "export_checksum" varchar,
    "status" varchar DEFAULT 'prepared',
    "submitted_at" timestamptz(6),
    "notes" varchar
  );
  ${ownerFks('distribution_submissions')}
  ${fk('distribution_submissions', 'rights_record_id', 'rights_records')}

  ${SLUGS.map(relsColumn).join('\n')}
  `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const relsDrops = SLUGS.map((slug) => {
    const column = slug.replace(/-/g, '_') + '_id'
    return `
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_${column}_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_${column}_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "${column}";`
  }).join('\n')
  const drops = [...TABLES]
    .reverse()
    .map((table) => `DROP TABLE IF EXISTS "${table}" CASCADE;`)
    .join('\n')
  await db.execute(
    sql.raw(`
  ${relsDrops}
  ${drops}
  `),
  )
  // Note: enum values 'service'/'license' added to enum_products_kind
  // are intentionally left in place on down — Postgres cannot remove
  // enum values safely, and leaving them is additive and harmless.
}

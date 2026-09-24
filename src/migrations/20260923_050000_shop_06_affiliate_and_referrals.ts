import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** SHOP-06 affiliate offers, clicks, conversion evidence, referrals, commission ledgers, and settlement batches. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "affiliate_offers" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "slug" varchar NOT NULL,
      "name" varchar NOT NULL,
      "destination_url" varchar NOT NULL,
      "content_id" uuid,
      "product_id" uuid,
      "network_reference" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "disclosure" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "sub_id_template" jsonb,
      "pricing_freshness" jsonb,
      "regions" jsonb DEFAULT '["global"]'::jsonb,
      "status" varchar NOT NULL DEFAULT 'draft',
      "link_health" jsonb DEFAULT '{"status":"healthy","consecutiveFailures":0}'::jsonb,
      "tracking_parameters" jsonb DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_offers_site_slug_idx" ON "affiliate_offers" ("site_id", "slug");

    CREATE TABLE IF NOT EXISTS "affiliate_clicks" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "offer_id" uuid NOT NULL,
      "click_token" varchar NOT NULL,
      "destination_url" varchar NOT NULL,
      "tracking_allowed" boolean NOT NULL DEFAULT true,
      "bot_detected" boolean NOT NULL DEFAULT false,
      "ip_hash" varchar,
      "user_agent_summary" varchar,
      "referrer" varchar,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "affiliate_clicks_site_token_idx" ON "affiliate_clicks" ("site_id", "click_token");
    CREATE INDEX IF NOT EXISTS "affiliate_clicks_site_offer_idx" ON "affiliate_clicks" ("site_id", "offer_id");

    CREATE TABLE IF NOT EXISTS "affiliate_conversions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "source" varchar NOT NULL,
      "network" varchar NOT NULL,
      "external_event_id" varchar NOT NULL,
      "external_order_id" varchar,
      "external_transaction_id" varchar,
      "attribution_hint" varchar,
      "amount_minor" varchar NOT NULL,
      "currency" varchar(3) NOT NULL,
      "commission_amount_minor" varchar,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "status" varchar NOT NULL DEFAULT 'pending',
      "raw_payload_hash" varchar NOT NULL,
      "reconciliation_state" varchar NOT NULL DEFAULT 'unmatched',
      "matched_offer_id" uuid,
      "matched_click_id" uuid,
      "reconciliation_notes" text,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "affiliate_conversions_network_event_idx" ON "affiliate_conversions" ("network", "external_event_id");
    CREATE INDEX IF NOT EXISTS "affiliate_conversions_payload_hash_idx" ON "affiliate_conversions" ("raw_payload_hash");

    CREATE TABLE IF NOT EXISTS "referral_programs" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "version" integer NOT NULL DEFAULT 1,
      "name" varchar NOT NULL,
      "status" varchar NOT NULL DEFAULT 'draft',
      "eligibility" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "codes" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "benefit" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "attribution" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "self_referral_rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "hold_period_days" integer NOT NULL DEFAULT 14,
      "reversal_rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "terms" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "referral_programs_site_version_idx" ON "referral_programs" ("site_id", "version");

    CREATE TABLE IF NOT EXISTS "commission_ledgers" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "program_id" uuid NOT NULL,
      "program_version" integer NOT NULL,
      "referrer_member_id" varchar NOT NULL,
      "order_id" uuid NOT NULL,
      "order_number" varchar NOT NULL,
      "payment_intent_id" uuid,
      "currency" varchar(3) NOT NULL,
      "amount_minor" varchar NOT NULL,
      "type" varchar NOT NULL DEFAULT 'accrual',
      "status" varchar NOT NULL DEFAULT 'pending',
      "mature_at" timestamp(3) with time zone NOT NULL,
      "settled_at" timestamp(3) with time zone,
      "reversed_at" timestamp(3) with time zone,
      "reversal_reason" varchar,
      "fraud_flag" varchar,
      "settlement_batch_id" uuid,
      "explanation" text NOT NULL,
      "compensates_ledger_id" uuid,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "commission_ledgers_site_member_idx" ON "commission_ledgers" ("site_id", "referrer_member_id");
    CREATE INDEX IF NOT EXISTS "commission_ledgers_site_curr_status_idx" ON "commission_ledgers" ("site_id", "currency", "status");

    CREATE TABLE IF NOT EXISTS "settlement_batches" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "batch_number" varchar NOT NULL,
      "currency" varchar(3) NOT NULL,
      "total_amount_minor" varchar NOT NULL,
      "entries_count" integer NOT NULL DEFAULT 0,
      "status" varchar NOT NULL DEFAULT 'draft',
      "approved_by" varchar,
      "approved_at" timestamp(3) with time zone,
      "export_payload_hash" varchar,
      "external_reference" varchar,
      "failure_reason" text,
      "reconciled_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "settlement_batches_site_batch_idx" ON "settlement_batches" ("site_id", "batch_number");

    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "referral_attribution" jsonb;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "referral_attribution";
    DROP TABLE IF EXISTS "settlement_batches" CASCADE;
    DROP TABLE IF EXISTS "commission_ledgers" CASCADE;
    DROP TABLE IF EXISTS "referral_programs" CASCADE;
    DROP TABLE IF EXISTS "affiliate_conversions" CASCADE;
    DROP TABLE IF EXISTS "affiliate_clicks" CASCADE;
    DROP TABLE IF EXISTS "affiliate_offers" CASCADE;
  `)
}

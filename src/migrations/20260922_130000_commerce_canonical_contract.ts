import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Commerce canonicalization is additive: retained legacy rows are never silently promoted.
 * Provider identifiers are evidence only; the Order/Payment records remain the local truth.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "order_lines" jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reconciliation_status" varchar(32) NOT NULL DEFAULT 'verified';
    CREATE TABLE IF NOT EXISTS "commerce_reconciliation_cases" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "legacy_type" varchar(80) NOT NULL,
      "legacy_id" varchar(160) NOT NULL,
      "reason" varchar(120) NOT NULL,
      "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "status" varchar(32) NOT NULL DEFAULT 'quarantined',
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "resolved_at" timestamp(3) with time zone,
      CONSTRAINT "commerce_reconciliation_cases_legacy_unique" UNIQUE ("legacy_type", "legacy_id")
    );
    CREATE INDEX IF NOT EXISTS "commerce_reconciliation_cases_open_idx" ON "commerce_reconciliation_cases" ("site_id", "status") WHERE "status" = 'quarantined';
    CREATE TABLE IF NOT EXISTS "commerce_fulfillment_instructions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
      "kind" varchar(32) NOT NULL,
      "state" varchar(32) NOT NULL DEFAULT 'pending',
      "instruction" jsonb NOT NULL,
      "provider_reference" varchar(200),
      "idempotency_key" varchar(200) NOT NULL,
      "failure" jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "commerce_fulfillment_instructions_idempotency_unique" UNIQUE ("idempotency_key")
    );
    CREATE TABLE IF NOT EXISTS "commerce_payment_attempts" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "payment_intent_id" uuid NOT NULL REFERENCES "payment_intents"("id") ON DELETE CASCADE,
      "provider_reference" varchar(200),
      "state" varchar(32) NOT NULL DEFAULT 'created',
      "verified_evidence" jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "commerce_payment_attempts";
    DROP TABLE IF EXISTS "commerce_fulfillment_instructions";
    DROP TABLE IF EXISTS "commerce_reconciliation_cases";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "reconciliation_status";
    ALTER TABLE "payment_intents" DROP COLUMN IF EXISTS "order_lines";
  `)
}

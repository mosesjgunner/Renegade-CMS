import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** SHOP-04 authoritative provider evidence, attempts, refunds, disputes, and immutable order snapshots. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "proposal_id" uuid REFERENCES "checkout_proposals"("id") ON DELETE SET NULL;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "binding_key" varchar;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "customer_key" varchar;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "attempt" numeric NOT NULL DEFAULT 1;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "guest_access_token_hash" varchar;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "return_path" varchar;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "cancel_path" varchar;
    CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_binding_key_idx" ON "checkout_sessions" ("binding_key") WHERE "binding_key" IS NOT NULL;

    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "party_snapshot" jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "address_snapshot" jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "totals_snapshot" jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "terms_snapshot" jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source_snapshot" jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "downstream_instructions" jsonb NOT NULL DEFAULT '[]'::jsonb;
    CREATE UNIQUE INDEX IF NOT EXISTS "orders_checkout_session_unique_idx" ON "orders" ("checkout_session_id");

    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "occurred_at" timestamp(3) with time zone;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "sequence" numeric;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "normalized_kind" varchar;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "provider_reference" varchar;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "sanitized_evidence" jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "processing_state" varchar NOT NULL DEFAULT 'received';
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "attempts" numeric NOT NULL DEFAULT 0;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "last_error" varchar;
    CREATE INDEX IF NOT EXISTS "payment_webhook_events_provider_reference_idx" ON "payment_webhook_events" ("provider_reference");

    CREATE TABLE IF NOT EXISTS "payment_attempts" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "checkout_session_id" uuid NOT NULL REFERENCES "checkout_sessions"("id") ON DELETE CASCADE,
      "payment_intent_id" uuid NOT NULL REFERENCES "payment_intents"("id") ON DELETE CASCADE,
      "proposal_id" uuid REFERENCES "checkout_proposals"("id") ON DELETE SET NULL,
      "merchant_connection_id" uuid NOT NULL REFERENCES "merchant_connections"("id") ON DELETE RESTRICT,
      "attempt" numeric NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "provider_key" varchar NOT NULL,
      "provider_contract_version" varchar NOT NULL,
      "provider_implementation_version" varchar NOT NULL,
      "provider_api_version" varchar NOT NULL,
      "provider_reference" varchar,
      "provider_payment_reference" varchar,
      "amount_minor" varchar NOT NULL,
      "currency" varchar NOT NULL,
      "state" varchar NOT NULL DEFAULT 'initiated',
      "refunded_amount_minor" varchar NOT NULL DEFAULT '0',
      "last_provider_sequence" numeric,
      "processed_event_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "unknown_since" timestamp(3) with time zone,
      "last_reconciled_at" timestamp(3) with time zone,
      "next_reconcile_at" timestamp(3) with time zone,
      "failure" jsonb,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "payment_attempts_idempotency_unique" UNIQUE ("idempotency_key"),
      CONSTRAINT "payment_attempts_session_attempt_unique" UNIQUE ("checkout_session_id", "attempt")
    );
    CREATE INDEX IF NOT EXISTS "payment_attempts_site_idx" ON "payment_attempts" ("site_id");
    CREATE INDEX IF NOT EXISTS "payment_attempts_provider_reference_idx" ON "payment_attempts" ("provider_key", "provider_reference");
    CREATE INDEX IF NOT EXISTS "payment_attempts_reconcile_idx" ON "payment_attempts" ("state", "next_reconcile_at");

    CREATE TABLE IF NOT EXISTS "commerce_refunds" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
      "payment_attempt_id" uuid NOT NULL REFERENCES "payment_attempts"("id") ON DELETE RESTRICT,
      "idempotency_key" varchar NOT NULL UNIQUE,
      "amount_minor" varchar NOT NULL,
      "currency" varchar NOT NULL,
      "kind" varchar NOT NULL,
      "state" varchar NOT NULL DEFAULT 'previewed',
      "reason" varchar NOT NULL,
      "requested_by" varchar NOT NULL,
      "approved_by" varchar,
      "provider_refund_reference" varchar,
      "provider_evidence" jsonb,
      "downstream_policy" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "correction_receipt" jsonb,
      "audit_log" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "commerce_refunds_site_idx" ON "commerce_refunds" ("site_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "commerce_refunds_provider_idx" ON "commerce_refunds" ("provider_refund_reference") WHERE "provider_refund_reference" IS NOT NULL;

    CREATE TABLE IF NOT EXISTS "commerce_disputes" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
      "payment_attempt_id" uuid NOT NULL REFERENCES "payment_attempts"("id") ON DELETE RESTRICT,
      "provider_dispute_reference" varchar NOT NULL UNIQUE,
      "amount_minor" varchar NOT NULL,
      "currency" varchar NOT NULL,
      "state" varchar NOT NULL DEFAULT 'open',
      "reason" varchar,
      "deadline_at" timestamp(3) with time zone,
      "sanitized_evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "audit_log" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "commerce_disputes_site_state_idx" ON "commerce_disputes" ("site_id", "state");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "commerce_disputes";
    DROP TABLE IF EXISTS "commerce_refunds";
    DROP TABLE IF EXISTS "payment_attempts";
    DROP INDEX IF EXISTS "payment_webhook_events_provider_reference_idx";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "last_error";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "attempts";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "processing_state";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "sanitized_evidence";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "provider_reference";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "normalized_kind";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "sequence";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "occurred_at";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "downstream_instructions";
    DROP INDEX IF EXISTS "orders_checkout_session_unique_idx";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "source_snapshot";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "terms_snapshot";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "totals_snapshot";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "address_snapshot";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "party_snapshot";
    DROP INDEX IF EXISTS "checkout_sessions_binding_key_idx";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "cancel_path";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "return_path";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "guest_access_token_hash";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "attempt";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "customer_key";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "binding_key";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "proposal_id";
  `)
}

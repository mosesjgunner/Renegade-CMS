import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Durable agreement snapshots and append-only lifecycle evidence for SHOP-05. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "plan_revisions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "plan_key" varchar NOT NULL, "revision" numeric NOT NULL,
      "name" varchar NOT NULL, "lifecycle" varchar NOT NULL DEFAULT 'published', "interval" varchar NOT NULL,
      "interval_count" numeric NOT NULL, "amount_minor" varchar NOT NULL, "currency" varchar(3) NOT NULL,
      "trial_days" numeric NOT NULL DEFAULT 0, "trial_eligibility" varchar NOT NULL, "entitlements" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "cancel_policy" varchar NOT NULL, "change_policy" varchar NOT NULL, "tax_policy" varchar NOT NULL,
      "provider_mappings" jsonb NOT NULL DEFAULT '{}'::jsonb, "published_at" timestamp(3) with time zone NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE, "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL, "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(), "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "plan_revisions_key_revision_unique" UNIQUE ("plan_key", "revision")
    );
    CREATE TABLE IF NOT EXISTS "subscriptions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "supporter_id" uuid NOT NULL REFERENCES "supporters"("id") ON DELETE RESTRICT,
      "plan_revision_id" uuid NOT NULL REFERENCES "plan_revisions"("id") ON DELETE RESTRICT, "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "plan_snapshot" jsonb NOT NULL, "provider_key" varchar NOT NULL, "provider_customer_reference" varchar, "provider_subscription_reference" varchar,
      "provider_status" varchar, "state" varchar NOT NULL DEFAULT 'incomplete', "source" varchar NOT NULL,
      "current_period_start" timestamp(3) with time zone NOT NULL, "current_period_end" timestamp(3) with time zone NOT NULL,
      "trial_end" timestamp(3) with time zone, "grace_end" timestamp(3) with time zone, "cancel_at_period_end" boolean NOT NULL DEFAULT false,
      "settings" jsonb NOT NULL DEFAULT '{}'::jsonb, "version" numeric NOT NULL DEFAULT 1, "last_event_sequence" numeric, "last_event_occurred_at" timestamp(3) with time zone, "last_reconciled_at" timestamp(3) with time zone,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL, "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL, "checkout_key" varchar UNIQUE, "failure" jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(), "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_provider_ref_idx" ON "subscriptions" ("provider_key", "provider_subscription_reference") WHERE "provider_subscription_reference" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "subscriptions_site_state_period_idx" ON "subscriptions" ("site_id", "state", "current_period_end");
    CREATE TABLE IF NOT EXISTS "subscription_events" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,
      "event_key" varchar NOT NULL, "provider_event_id" varchar, "kind" varchar NOT NULL, "occurred_at" timestamp(3) with time zone NOT NULL,
      "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb, "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL, "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(), "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "subscription_events_event_key_unique" UNIQUE ("event_key")
    );
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "resource" varchar;
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "capability" varchar;
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "scope" varchar;
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "grant_key" varchar;
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "limit" numeric;
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb;
    CREATE UNIQUE INDEX IF NOT EXISTS "entitlements_grant_key_idx" ON "entitlements" ("grant_key") WHERE "grant_key" IS NOT NULL;
    ALTER TABLE "forum_spaces" ADD COLUMN IF NOT EXISTS "required_entitlement" jsonb;
    ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "required_entitlement" jsonb;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "subscription_events"; DROP TABLE IF EXISTS "subscriptions"; DROP TABLE IF EXISTS "plan_revisions";
    DROP INDEX IF EXISTS "entitlements_grant_key_idx";
    ALTER TABLE "entitlements" DROP COLUMN IF EXISTS "evidence", DROP COLUMN IF EXISTS "limit", DROP COLUMN IF EXISTS "grant_key", DROP COLUMN IF EXISTS "scope", DROP COLUMN IF EXISTS "capability", DROP COLUMN IF EXISTS "resource";
    ALTER TABLE "forum_spaces" DROP COLUMN IF EXISTS "required_entitlement";
    ALTER TABLE "content" DROP COLUMN IF EXISTS "required_entitlement";
  `)
}

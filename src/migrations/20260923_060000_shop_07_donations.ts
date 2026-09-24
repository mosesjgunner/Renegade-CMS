import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** SHOP-07 campaign revisions and donation snapshots; payment truth remains SHOP-04. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "donation_campaigns" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "campaign_key" varchar NOT NULL, "version" numeric NOT NULL,
      "title" varchar NOT NULL, "story" jsonb, "media" jsonb NOT NULL DEFAULT '[]'::jsonb, "purpose" varchar NOT NULL,
      "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
      "designations" jsonb NOT NULL DEFAULT '[]'::jsonb, "starts_at" timestamptz, "ends_at" timestamptz,
      "goal_amount_minor" varchar, "goal_rules" jsonb NOT NULL DEFAULT '{}'::jsonb, "allowed_amounts" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "currency" varchar(3) NOT NULL, "recurrence" jsonb NOT NULL DEFAULT '["one-time"]'::jsonb, "fee_cover" jsonb,
      "privacy_default" varchar NOT NULL DEFAULT 'private', "disclosures" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "lifecycle" varchar NOT NULL DEFAULT 'draft', "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL, "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "donation_campaigns_site_key_version_unique" UNIQUE ("site_id", "campaign_key", "version"),
      CONSTRAINT "donation_campaigns_dates_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at"),
      CONSTRAINT "donation_campaigns_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
    );
    CREATE INDEX IF NOT EXISTS "donation_campaigns_site_lifecycle_idx" ON "donation_campaigns" ("site_id", "lifecycle");
    CREATE TABLE IF NOT EXISTS "donation_intents" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "campaign_id" uuid NOT NULL REFERENCES "donation_campaigns"("id") ON DELETE RESTRICT,
      "campaign_version" numeric NOT NULL, "designation" varchar, "donor_snapshot" jsonb NOT NULL, "money_snapshot" jsonb NOT NULL,
      "recognition" varchar NOT NULL, "public_display_name" varchar, "donor_message" varchar, "tracking_source" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "payment_intent_id" uuid REFERENCES "payment_intents"("id") ON DELETE RESTRICT, "subscription_id" uuid REFERENCES "subscriptions"("id") ON DELETE RESTRICT,
      "recurrence" varchar NOT NULL DEFAULT 'one-time', "lifecycle" varchar NOT NULL DEFAULT 'created',
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE, "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL, "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "donation_intents_payment_unique" UNIQUE ("payment_intent_id"),
      CONSTRAINT "donation_intents_recognition_check" CHECK ("recognition" IN ('public','anonymous','private')),
      CONSTRAINT "donation_intents_recurrence_check" CHECK ("recurrence" IN ('one-time','recurring'))
    );
    CREATE INDEX IF NOT EXISTS "donation_intents_campaign_lifecycle_idx" ON "donation_intents" ("campaign_id", "lifecycle");
    CREATE TABLE IF NOT EXISTS "donations" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "donation_intent_id" uuid NOT NULL UNIQUE REFERENCES "donation_intents"("id") ON DELETE RESTRICT,
      "campaign_id" uuid NOT NULL REFERENCES "donation_campaigns"("id") ON DELETE RESTRICT, "payment_intent_id" uuid NOT NULL UNIQUE REFERENCES "payment_intents"("id") ON DELETE RESTRICT,
      "subscription_id" uuid REFERENCES "subscriptions"("id") ON DELETE RESTRICT, "donor_snapshot" jsonb NOT NULL, "campaign_snapshot" jsonb NOT NULL,
      "designation" varchar, "base_amount_minor" varchar NOT NULL, "fee_covered_amount_minor" varchar NOT NULL DEFAULT '0', "currency" varchar(3) NOT NULL,
      "recognition" varchar NOT NULL, "public_display_name" varchar, "donor_message" varchar, "tracking_source" jsonb NOT NULL DEFAULT '{}',
      "lifecycle" varchar NOT NULL DEFAULT 'succeeded',
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE, "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL, "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "donations_money_check" CHECK ("base_amount_minor" ~ '^[0-9]+$' AND "fee_covered_amount_minor" ~ '^[0-9]+$' AND "currency" ~ '^[A-Z]{3}$'),
      CONSTRAINT "donations_recognition_check" CHECK ("recognition" IN ('public','anonymous','private'))
    );
    CREATE INDEX IF NOT EXISTS "donations_site_created_idx" ON "donations" ("site_id", "created_at");
    CREATE TABLE IF NOT EXISTS "donation_events" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "donation_id" uuid REFERENCES "donations"("id") ON DELETE RESTRICT,
      "donation_intent_id" uuid REFERENCES "donation_intents"("id") ON DELETE RESTRICT,
      "event_key" varchar NOT NULL UNIQUE, "kind" varchar NOT NULL, "occurred_at" timestamptz NOT NULL, "actor" varchar,
      "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "donation_events_exactly_one_target_check" CHECK (("donation_id" IS NOT NULL) <> ("donation_intent_id" IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS "donation_events_donation_occurred_idx" ON "donation_events" ("donation_id", "occurred_at");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`DROP TABLE IF EXISTS "donation_events"; DROP TABLE IF EXISTS "donations"; DROP TABLE IF EXISTS "donation_intents"; DROP TABLE IF EXISTS "donation_campaigns";`,
  )
}

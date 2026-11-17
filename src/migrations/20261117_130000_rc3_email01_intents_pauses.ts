import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * RC3-EMAIL-01: durable account-mail outbox (email_intents) and dispatch
 * pause controls (email_pauses). Hand-written following the repository's
 * established DDL patterns (migrate:create stalls on pre-existing enum
 * drift); column set verified against the drizzle schema Payload generates
 * for these collections. All statements are idempotent so the migration is
 * safe under the fresh verifier's double-run.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN CREATE TYPE "public"."enum_email_intents_purpose" AS ENUM('member-sign-in', 'member-email-link', 'staff-invitation', 'account-recovery', 'order-receipt', 'community-notification', 'form-notification', 'telecom-fallback', 'admin-alert'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_email_intents_traffic_class" AS ENUM('account', 'operational'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_email_intents_submission" AS ENUM('queued', 'held', 'leased', 'submitting', 'accepted', 'rejected', 'unknown', 'expired', 'cancelled', 'retry-scheduled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_email_intents_receiving" AS ENUM('unobserved', 'deferred', 'remote-accepted', 'bounced', 'provider-failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_email_intents_placement" AS ENUM('unobserved', 'inbox', 'inbox-tab', 'spam', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_email_intents_action_state" AS ENUM('not-observed', 'completed', 'expired', 'revoked', 'consumed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_email_pauses_scope" AS ENUM('global-class', 'provider-boundary', 'site', 'site-class', 'campaign'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_email_pauses_traffic_class" AS ENUM('account', 'operational', 'audience_confirmation', 'audience'); EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_email_pauses_boundary" AS ENUM('account', 'audience'); EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "email_intents" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid,
      "purpose" "enum_email_intents_purpose" NOT NULL,
      "traffic_class" "enum_email_intents_traffic_class" DEFAULT 'account' NOT NULL,
      "recipient_email" varchar NOT NULL,
      "recipient_hash" varchar NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "from_identity" varchar,
      "subject" varchar NOT NULL,
      "payload_ciphertext" varchar NOT NULL,
      "submission" "enum_email_intents_submission" DEFAULT 'queued' NOT NULL,
      "receiving" "enum_email_intents_receiving" DEFAULT 'unobserved' NOT NULL,
      "placement" "enum_email_intents_placement" DEFAULT 'unobserved' NOT NULL,
      "action_state" "enum_email_intents_action_state" DEFAULT 'not-observed' NOT NULL,
      "provider" varchar,
      "provider_message_id" varchar,
      "attempts" numeric DEFAULT 0,
      "attempt_budget" numeric DEFAULT 4,
      "lease_owner" varchar,
      "lease_until" timestamp(3) with time zone,
      "next_attempt_at" timestamp(3) with time zone,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "accepted_at" timestamp(3) with time zone,
      "events" jsonb DEFAULT '[]'::jsonb,
      "last_error" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "email_pauses" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid,
      "scope" "enum_email_pauses_scope" DEFAULT 'site-class' NOT NULL,
      "traffic_class" "enum_email_pauses_traffic_class",
      "boundary" "enum_email_pauses_boundary",
      "campaign_id" varchar,
      "reason" varchar NOT NULL,
      "active" boolean DEFAULT true,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    DO $$ BEGIN ALTER TABLE "email_intents" ADD CONSTRAINT "email_intents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "email_pauses" ADD CONSTRAINT "email_pauses_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "email_intents_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "email_pauses_id" uuid;

    CREATE INDEX IF NOT EXISTS "email_intents_site_idx" ON "email_intents" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "email_intents_purpose_idx" ON "email_intents" USING btree ("purpose");
    CREATE INDEX IF NOT EXISTS "email_intents_recipient_hash_idx" ON "email_intents" USING btree ("recipient_hash");
    CREATE UNIQUE INDEX IF NOT EXISTS "email_intents_idempotency_key_idx" ON "email_intents" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "email_intents_provider_message_id_idx" ON "email_intents" USING btree ("provider_message_id");
    CREATE INDEX IF NOT EXISTS "email_intents_lease_until_idx" ON "email_intents" USING btree ("lease_until");
    CREATE INDEX IF NOT EXISTS "email_intents_next_attempt_at_idx" ON "email_intents" USING btree ("next_attempt_at");
    CREATE INDEX IF NOT EXISTS "email_intents_expires_at_idx" ON "email_intents" USING btree ("expires_at");
    CREATE INDEX IF NOT EXISTS "email_intents_updated_at_idx" ON "email_intents" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "email_intents_created_at_idx" ON "email_intents" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "email_pauses_site_idx" ON "email_pauses" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "email_pauses_campaign_id_idx" ON "email_pauses" USING btree ("campaign_id");
    CREATE INDEX IF NOT EXISTS "email_pauses_active_idx" ON "email_pauses" USING btree ("active");
    CREATE INDEX IF NOT EXISTS "email_pauses_updated_at_idx" ON "email_pauses" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "email_pauses_created_at_idx" ON "email_pauses" USING btree ("created_at");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Rollback pauses dispatch by preserving the records: dropping the outbox
  // would erase suppression-adjacent evidence and accepted provider IDs, so
  // the down migration intentionally refuses. Disable mail via EMAIL_MODE
  // and roll the code back instead.
  void db
  throw new Error(
    'RC3-EMAIL-01 migration is irreversible by design: email_intents/email_pauses hold delivery evidence that must not be erased by a rollback.',
  )
}

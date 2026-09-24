import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** AUD-08: Audience Pass Gate & Operational Lock Relations */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 1. Ensure all audience collections have lock relations in payload_locked_documents_rels
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "email_templates_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_email_templates_id_idx" ON "payload_locked_documents_rels" ("email_templates_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "email_delivery_events_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_email_delivery_events_id_idx" ON "payload_locked_documents_rels" ("email_delivery_events_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "telecom_messages_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_telecom_messages_id_idx" ON "payload_locked_documents_rels" ("telecom_messages_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "telecom_deliveries_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_telecom_deliveries_id_idx" ON "payload_locked_documents_rels" ("telecom_deliveries_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "telecom_delivery_events_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_telecom_delivery_events_id_idx" ON "payload_locked_documents_rels" ("telecom_delivery_events_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "automation_runs_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_automation_runs_id_idx" ON "payload_locked_documents_rels" ("automation_runs_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "automation_failures_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_automation_failures_id_idx" ON "payload_locked_documents_rels" ("automation_failures_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "recipient_snapshots_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_recipient_snapshots_id_idx" ON "payload_locked_documents_rels" ("recipient_snapshots_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "audience_frequency_policies_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_audience_frequency_policies_id_idx" ON "payload_locked_documents_rels" ("audience_frequency_policies_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "audience_experiments_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_audience_experiments_id_idx" ON "payload_locked_documents_rels" ("audience_experiments_id");

    -- 2. Ensure missing schema columns on existing audience tables are added
    ALTER TABLE "audience_lists" ADD COLUMN IF NOT EXISTS "provenance" jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE "audience_segments" ADD COLUMN IF NOT EXISTS "version" varchar DEFAULT '1.0.0';
    ALTER TABLE "audience_segments" ADD COLUMN IF NOT EXISTS "last_evaluation" jsonb;
    ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "recipient_snapshot_id" uuid;
    ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "priority" numeric DEFAULT 100;
    ALTER TABLE "email_deliveries" ADD COLUMN IF NOT EXISTS "recipient_snapshot_hash" varchar;
    ALTER TABLE "email_deliveries" ADD COLUMN IF NOT EXISTS "rfc_message_id" varchar;
    ALTER TABLE "email_deliveries" ADD COLUMN IF NOT EXISTS "message_id" uuid;
    ALTER TYPE "enum_email_deliveries_status" ADD VALUE IF NOT EXISTS 'accepted';
    ALTER TYPE "enum_email_deliveries_status" ADD VALUE IF NOT EXISTS 'deferred';
    ALTER TYPE "enum_email_deliveries_status" ADD VALUE IF NOT EXISTS 'unknown';
    ALTER TYPE "enum_email_deliveries_status" ADD VALUE IF NOT EXISTS 'dead-letter';
    ALTER TYPE "enum_automation_definitions_status" ADD VALUE IF NOT EXISTS 'review';
    ALTER TYPE "enum_automation_definitions_status" ADD VALUE IF NOT EXISTS 'cancelled';
    ALTER TYPE "enum_consent_events_event" ADD VALUE IF NOT EXISTS 'preference-granted';
    ALTER TYPE "enum_consent_events_event" ADD VALUE IF NOT EXISTS 'preference-withdrawn';
    ALTER TYPE "enum_consent_events_event" ADD VALUE IF NOT EXISTS 'operator-correction';
    ALTER TYPE "enum_consent_events_event" ADD VALUE IF NOT EXISTS 'erased';
    ALTER TABLE "automation_definitions" ADD COLUMN IF NOT EXISTS "version" varchar DEFAULT '1.0.0';
    ALTER TABLE "automation_definitions" ADD COLUMN IF NOT EXISTS "reentry_policy" varchar DEFAULT 'never';
    ALTER TABLE "automation_definitions" ADD COLUMN IF NOT EXISTS "quiet_hours" jsonb;
    ALTER TABLE "automation_definitions" ADD COLUMN IF NOT EXISTS "approved_at" timestamp(3) with time zone;
    ALTER TABLE "automation_definitions" ADD COLUMN IF NOT EXISTS "pinned" jsonb;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'email_delivery_events' AND column_name = 'delivery_id' AND data_type = 'integer'
      ) THEN
        DROP TABLE IF EXISTS "email_delivery_events" CASCADE;
        CREATE TABLE "email_delivery_events" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "delivery_id" uuid NOT NULL REFERENCES "email_deliveries"("id") ON DELETE CASCADE,
          "idempotency_key" varchar NOT NULL UNIQUE,
          "provider" varchar NOT NULL,
          "provider_event_id" varchar,
          "event" varchar NOT NULL,
          "occurred_at" timestamp(3) with time zone NOT NULL,
          "evidence" jsonb DEFAULT '{}'::jsonb,
          "created_at" timestamp(3) with time zone DEFAULT now(),
          "updated_at" timestamp(3) with time zone DEFAULT now()
        );
      END IF;
    END $$;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'telecom_messages' AND column_name = 'site_id' AND data_type = 'integer'
      ) THEN
        DROP TABLE IF EXISTS "telecom_delivery_events" CASCADE;
        DROP TABLE IF EXISTS "telecom_deliveries" CASCADE;
        DROP TABLE IF EXISTS "telecom_messages" CASCADE;

        CREATE TABLE "telecom_messages" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
          "publication_id" uuid,
          "space_id" uuid,
          "owner_id" uuid,
          "title" varchar NOT NULL,
          "body" text NOT NULL,
          "channel" varchar NOT NULL DEFAULT 'sms',
          "purpose" varchar DEFAULT 'marketing',
          "status" varchar NOT NULL DEFAULT 'draft',
          "from" varchar,
          "scheduled_for" timestamp(3) with time zone,
          "rcs_content" jsonb,
          "fallback_policy" varchar DEFAULT 'prohibit',
          "fallback_sms_body" text,
          "audience" jsonb,
          "estimated_cost" jsonb,
          "approved_at" timestamp(3) with time zone,
          "approved_render" jsonb,
          "created_at" timestamp(3) with time zone DEFAULT now(),
          "updated_at" timestamp(3) with time zone DEFAULT now()
        );

        CREATE TABLE "telecom_deliveries" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
          "publication_id" uuid,
          "space_id" uuid,
          "owner_id" uuid,
          "message_id" uuid NOT NULL REFERENCES "telecom_messages"("id") ON DELETE CASCADE,
          "subscriber_id" uuid,
          "recipient_phone" varchar NOT NULL,
          "recipient_phone_hash" varchar NOT NULL,
          "channel" varchar NOT NULL DEFAULT 'sms',
          "idempotency_key" varchar NOT NULL UNIQUE,
          "status" varchar NOT NULL DEFAULT 'queued',
          "delivery_path" varchar,
          "provider" varchar,
          "provider_message_id" varchar,
          "attempts" integer DEFAULT 0,
          "segments" integer,
          "accepted_at" timestamp(3) with time zone,
          "scheduled_for" timestamp(3) with time zone,
          "quiet_hours_delayed_until" timestamp(3) with time zone,
          "message_snapshot" jsonb,
          "actual_cost" jsonb,
          "outcome" jsonb,
          "created_at" timestamp(3) with time zone DEFAULT now(),
          "updated_at" timestamp(3) with time zone DEFAULT now()
        );

        CREATE TABLE "telecom_delivery_events" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "delivery_id" uuid NOT NULL REFERENCES "telecom_deliveries"("id") ON DELETE CASCADE,
          "idempotency_key" varchar NOT NULL UNIQUE,
          "provider" varchar NOT NULL,
          "provider_event_id" varchar,
          "event" varchar NOT NULL,
          "occurred_at" timestamp(3) with time zone NOT NULL,
          "evidence" jsonb DEFAULT '{}'::jsonb,
          "created_at" timestamp(3) with time zone DEFAULT now(),
          "updated_at" timestamp(3) with time zone DEFAULT now()
        );
      END IF;
    END $$;

    -- 3. Ensure durable automation and recipient tables exist
    CREATE TABLE IF NOT EXISTS "automation_runs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid,
      "definition_id" uuid,
      "source_event_id" uuid,
      "idempotency_key" varchar NOT NULL UNIQUE,
      "status" varchar NOT NULL DEFAULT 'queued',
      "subject" jsonb NOT NULL,
      "definition_version" varchar NOT NULL,
      "step" integer DEFAULT 0,
      "next_run_at" timestamp(3) with time zone,
      "outcome" jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "automation_failures" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" uuid,
      "action_index" integer NOT NULL,
      "error" jsonb NOT NULL,
      "retryable" boolean DEFAULT true,
      "resolved_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "recipient_snapshots" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid,
      "publication_id" uuid,
      "space_id" uuid,
      "owner_id" uuid,
      "message_id" uuid,
      "segment_id" uuid,
      "segment_version" varchar NOT NULL,
      "evaluated_at" timestamp(3) with time zone NOT NULL,
      "recipients" jsonb NOT NULL,
      "exclusion_counts" jsonb NOT NULL,
      "hash" varchar NOT NULL UNIQUE,
      "approval_audit" jsonb NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "audience_frequency_policies" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid,
      "publication_id" uuid,
      "space_id" uuid,
      "owner_id" uuid,
      "purpose" varchar NOT NULL,
      "channel" varchar DEFAULT 'email',
      "max_sends" integer NOT NULL DEFAULT 4,
      "window_hours" integer NOT NULL DEFAULT 168,
      "global_fatigue" boolean DEFAULT false,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    ALTER TABLE "recipient_snapshots" ADD COLUMN IF NOT EXISTS "publication_id" uuid;
    ALTER TABLE "recipient_snapshots" ADD COLUMN IF NOT EXISTS "space_id" uuid;
    ALTER TABLE "recipient_snapshots" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
    ALTER TABLE "automation_runs" ADD COLUMN IF NOT EXISTS "publication_id" uuid;
    ALTER TABLE "automation_runs" ADD COLUMN IF NOT EXISTS "space_id" uuid;
    ALTER TABLE "automation_runs" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
    ALTER TABLE "automation_failures" ADD COLUMN IF NOT EXISTS "publication_id" uuid;
    ALTER TABLE "automation_failures" ADD COLUMN IF NOT EXISTS "space_id" uuid;
    ALTER TABLE "automation_failures" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
    ALTER TABLE "audience_frequency_policies" ADD COLUMN IF NOT EXISTS "publication_id" uuid;
    ALTER TABLE "audience_frequency_policies" ADD COLUMN IF NOT EXISTS "space_id" uuid;
    ALTER TABLE "audience_frequency_policies" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "email_templates_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "email_delivery_events_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "telecom_messages_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "telecom_deliveries_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "telecom_delivery_events_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "automation_runs_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "automation_failures_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "recipient_snapshots_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "audience_frequency_policies_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "audience_experiments_id";
  `)
}

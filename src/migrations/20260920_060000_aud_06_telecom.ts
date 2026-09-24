import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** AUD-06 Telecom delivery and operational evidence tables */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "telecom_messages" (
      "id" serial PRIMARY KEY,
      "site_id" integer,
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

    CREATE TABLE IF NOT EXISTS "telecom_deliveries" (
      "id" serial PRIMARY KEY,
      "site_id" integer,
      "message_id" integer NOT NULL,
      "subscriber_id" integer,
      "recipient_phone" varchar NOT NULL,
      "recipient_phone_hash" varchar NOT NULL,
      "channel" varchar NOT NULL DEFAULT 'sms',
      "idempotency_key" varchar NOT NULL,
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

    CREATE UNIQUE INDEX IF NOT EXISTS "telecom_deliveries_idempotency_key_idx" ON "telecom_deliveries" ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "telecom_deliveries_recipient_phone_hash_idx" ON "telecom_deliveries" ("recipient_phone_hash");
    CREATE INDEX IF NOT EXISTS "telecom_deliveries_status_idx" ON "telecom_deliveries" ("status");
    CREATE INDEX IF NOT EXISTS "telecom_deliveries_provider_message_id_idx" ON "telecom_deliveries" ("provider_message_id");

    CREATE TABLE IF NOT EXISTS "telecom_delivery_events" (
      "id" serial PRIMARY KEY,
      "delivery_id" integer NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "provider" varchar NOT NULL,
      "provider_event_id" varchar,
      "event" varchar NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "evidence" jsonb DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "telecom_delivery_events_idempotency_key_idx" ON "telecom_delivery_events" ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "telecom_delivery_events_provider_event_id_idx" ON "telecom_delivery_events" ("provider_event_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "telecom_delivery_events";
    DROP TABLE IF EXISTS "telecom_deliveries";
    DROP TABLE IF EXISTS "telecom_messages";
  `)
}

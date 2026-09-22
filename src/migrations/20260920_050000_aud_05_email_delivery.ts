import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** AUD-05 only adds operational evidence; canonical approval and consent remain in Audience. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "email_deliveries"
      ADD COLUMN IF NOT EXISTS "accepted_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "lease_until" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "render_hash" varchar,
      ADD COLUMN IF NOT EXISTS "message_id" varchar,
      ADD COLUMN IF NOT EXISTS "unsubscribe_token" varchar;
    CREATE INDEX IF NOT EXISTS "email_deliveries_next_attempt_at_idx" ON "email_deliveries" ("next_attempt_at");
    CREATE INDEX IF NOT EXISTS "email_deliveries_lease_until_idx" ON "email_deliveries" ("lease_until");
    CREATE TABLE IF NOT EXISTS "email_delivery_events" (
      "id" serial PRIMARY KEY, "delivery_id" integer NOT NULL, "idempotency_key" varchar NOT NULL,
      "provider" varchar NOT NULL, "provider_event_id" varchar, "event" varchar NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL, "evidence" jsonb DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now(), "updated_at" timestamp(3) with time zone DEFAULT now());
    CREATE UNIQUE INDEX IF NOT EXISTS "email_delivery_events_idempotency_key_idx" ON "email_delivery_events" ("idempotency_key");
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "email_delivery_events";`)
}

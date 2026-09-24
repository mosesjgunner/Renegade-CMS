import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * SHOP-03 Print-on-Demand & Fulfillment shared contract.
 * Durable POD jobs, encrypted connections, manual fulfillment fallback packages, and signed event logs.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "pod_connections" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "provider_key" varchar(64) NOT NULL,
      "label" varchar(120) NOT NULL,
      "remote_store_id" varchar(120),
      "remote_store_name" varchar(160),
      "encrypted_api_key" text NOT NULL,
      "encrypted_webhook_secret" text,
      "status" varchar(32) NOT NULL DEFAULT 'active',
      "capabilities" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "last_health_checked_at" timestamp(3) with time zone,
      "last_health_status" varchar(32),
      "last_health_reason" text,
      "disabled_reason" text,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "pod_connections_site_idx" ON "pod_connections" ("site_id");
    CREATE INDEX IF NOT EXISTS "pod_connections_provider_idx" ON "pod_connections" ("provider_key");

    CREATE TABLE IF NOT EXISTS "pod_jobs" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "connection_id" uuid REFERENCES "pod_connections"("id") ON DELETE SET NULL,
      "provider_key" varchar(64) NOT NULL,
      "package_index" numeric NOT NULL DEFAULT 0,
      "idempotency_key" varchar(200) NOT NULL,
      "payload_hash" varchar(64) NOT NULL,
      "state" varchar(32) NOT NULL DEFAULT 'created',
      "address_policy" varchar(32) NOT NULL DEFAULT 'domestic',
      "recipient_snapshot" jsonb NOT NULL,
      "items_snapshot" jsonb NOT NULL,
      "cost_snapshot" jsonb NOT NULL,
      "attempt_count" numeric NOT NULL DEFAULT 0,
      "external_order_id" varchar(160),
      "hold_expires_at" timestamp(3) with time zone,
      "released_at" timestamp(3) with time zone,
      "audit_trail" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "last_error" text,
      "parent_job_id" uuid REFERENCES "pod_jobs"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "pod_jobs_idempotency_unique" UNIQUE ("idempotency_key")
    );
    CREATE INDEX IF NOT EXISTS "pod_jobs_order_idx" ON "pod_jobs" ("order_id");
    CREATE INDEX IF NOT EXISTS "pod_jobs_site_idx" ON "pod_jobs" ("site_id");
    CREATE INDEX IF NOT EXISTS "pod_jobs_external_order_idx" ON "pod_jobs" ("external_order_id");
    CREATE INDEX IF NOT EXISTS "pod_jobs_state_idx" ON "pod_jobs" ("state");

    CREATE TABLE IF NOT EXISTS "pod_job_events" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "job_id" uuid NOT NULL REFERENCES "pod_jobs"("id") ON DELETE CASCADE,
      "provider_key" varchar(64) NOT NULL,
      "provider_event_id" varchar(160) NOT NULL,
      "kind" varchar(64) NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "fulfillments" jsonb,
      "tracking" jsonb,
      "raw_evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "pod_job_events_provider_unique" UNIQUE ("provider_key", "provider_event_id")
    );
    CREATE INDEX IF NOT EXISTS "pod_job_events_job_idx" ON "pod_job_events" ("job_id");

    CREATE TABLE IF NOT EXISTS "manual_fulfillment_packages" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "package_index" numeric NOT NULL DEFAULT 0,
      "source" varchar(64) NOT NULL,
      "status" varchar(32) NOT NULL DEFAULT 'pending_acknowledgement',
      "approved_lines" jsonb NOT NULL,
      "permissioned_address_manifest" jsonb NOT NULL,
      "instructions" text,
      "acknowledgement" jsonb,
      "external_fulfillment" jsonb,
      "audit_trail" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_order_idx" ON "manual_fulfillment_packages" ("order_id");
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_site_idx" ON "manual_fulfillment_packages" ("site_id");
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_status_idx" ON "manual_fulfillment_packages" ("status");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "manual_fulfillment_packages";
    DROP TABLE IF EXISTS "pod_job_events";
    DROP TABLE IF EXISTS "pod_jobs";
    DROP TABLE IF EXISTS "pod_connections";
  `)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Additive public API idempotency and retained, privacy-safe webhook envelopes. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'webhook-delivery-dispatch';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'webhook-delivery-dispatch';
    ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "payload" jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "last_error" varchar;
    CREATE TABLE IF NOT EXISTS "api_request_records" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid, "space_id" uuid, "client_id" uuid NOT NULL REFERENCES "api_clients"("id") ON DELETE RESTRICT,
      "idempotency_key" varchar NOT NULL, "method" varchar NOT NULL, "path" varchar NOT NULL,
      "response_status" numeric NOT NULL, "response" jsonb NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "api_request_records_idempotency_key_idx" ON "api_request_records" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "api_request_records_site_idx" ON "api_request_records" USING btree ("site_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "api_request_records_id" uuid;
  `)
}
export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    '20260831_140000_public_api_webhooks is additive; rollback requires a reviewed data migration.',
  )
}

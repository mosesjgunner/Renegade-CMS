import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'audience-form-intake';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'audience-form-intake';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'community-email-dispatch';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'community-email-dispatch';
    ALTER TABLE audience_delivery_outbox ADD COLUMN IF NOT EXISTS idempotency_key text;
    ALTER TABLE audience_delivery_outbox ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
    ALTER TABLE audience_delivery_outbox ADD COLUMN IF NOT EXISTS provider text;
    ALTER TABLE audience_delivery_outbox ADD COLUMN IF NOT EXISTS provider_message_id text;
    ALTER TABLE inbox_notifications ADD COLUMN IF NOT EXISTS channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb;
    CREATE UNIQUE INDEX IF NOT EXISTS audience_delivery_outbox_idempotency ON audience_delivery_outbox(idempotency_key);
  `)
}
/** PostgreSQL enum removal is destructive; retain the unused value on rollback. */
export async function down(_args: MigrateDownArgs): Promise<void> {}

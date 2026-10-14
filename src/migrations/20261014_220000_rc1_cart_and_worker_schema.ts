import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

/** Align additive cart/worker schema with registered optional-merchant carts and housekeeping tasks. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE carts ALTER COLUMN merchant_connection_id DROP NOT NULL;
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'media-upload-cleanup';
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'community-message-attachment-cleanup';
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'community-message-attachment-scan';
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'video-process';
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'media-usage-reconcile';
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'audio-recipe-task';
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'analytics-retention-cleanup';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'media-upload-cleanup';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'community-message-attachment-cleanup';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'community-message-attachment-scan';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'video-process';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'media-usage-reconcile';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'audio-recipe-task';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'analytics-retention-cleanup';
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Keep additive enum labels: existing job/audit records must remain readable.
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM carts WHERE merchant_connection_id IS NULL) THEN
        RAISE EXCEPTION 'Unassigned carts must be preserved; restore the pre-migration backup to roll back.';
      END IF;
    END $$;
    ALTER TABLE carts ALTER COLUMN merchant_connection_id SET NOT NULL;
  `)
}

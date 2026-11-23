import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs) {
  await db.execute(sql`
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'creator-transcript-assist';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'creator-transcript-assist';
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'creator-synthetic-dub';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'creator-synthetic-dub';
  `)
}

// Existing queued and historical jobs retain their enum values.
export async function down(_args: MigrateDownArgs) {}

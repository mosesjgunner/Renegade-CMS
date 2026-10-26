import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

/** Match the existing canonical suppression contract without rewriting retained outcomes. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "enum_suppressions_reason" ADD VALUE IF NOT EXISTS 'invalid';
    ALTER TYPE "enum_suppressions_reason" ADD VALUE IF NOT EXISTS 'block';
    ALTER TYPE "enum_suppressions_reason" ADD VALUE IF NOT EXISTS 'operator';
    ALTER TYPE "enum_suppressions_reason" ADD VALUE IF NOT EXISTS 'legal';
    ALTER TYPE "enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'audience-telecom-delivery';
    ALTER TYPE "enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'audience-telecom-dispatch';
    ALTER TYPE "enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'audience-telecom-delivery';
    ALTER TYPE "enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'audience-telecom-dispatch';
  `)
}

// Additive enum labels remain available to preserve suppression/history on rollback.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`SELECT 1;`)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * RC3-19 (#30): registering the scheduled `audience-automation-resume`
 * task adds its slug to the persisted jobs task enums, the same
 * pattern as every prior task registration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'audience-automation-resume';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'audience-automation-resume';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // PostgreSQL cannot remove a single enum value; the label is inert
  // once the task leaves the config. Mirrors prior task migrations.
  await db.execute(sql`SELECT 1`)
}

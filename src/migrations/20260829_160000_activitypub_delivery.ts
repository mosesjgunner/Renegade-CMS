import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/** Payload Jobs' task slug enum is database-backed; federation delivery is durable work. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'network-delivery';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'network-delivery';
  `)
}
export async function down(_: MigrateDownArgs): Promise<void> {
  // PostgreSQL enum values cannot be safely removed in place.
}

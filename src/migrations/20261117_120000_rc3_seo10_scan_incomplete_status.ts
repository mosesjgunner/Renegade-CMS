import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * SEO-1.0 / DEBT-14: quality scans gain an 'incomplete' status so a
 * rendered audit that examined only part of its scope (or none of it)
 * is never persisted as a clean 'completed' scan.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_quality_scans_status" ADD VALUE IF NOT EXISTS 'incomplete';
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    'enum_quality_scans_status values cannot be removed once added; this migration is irreversible.',
  )
}

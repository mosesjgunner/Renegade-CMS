import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "enum_social_drafts_status" ADD VALUE IF NOT EXISTS 'unknown';
    ALTER TYPE "enum_social_network_variants_status" ADD VALUE IF NOT EXISTS 'unknown';
    ALTER TYPE "enum_social_queue_items_status" ADD VALUE IF NOT EXISTS 'unknown';
    ALTER TYPE "enum_campaigns_status" ADD VALUE IF NOT EXISTS 'unknown';
  `)
}

// PostgreSQL cannot remove an enum label without rewriting retained evidence.
// Keeping the additive label is safe for rollback; no uncertain delivery is relabeled.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`SELECT 1;`)
}

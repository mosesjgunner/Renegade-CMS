import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds the quality-gate review columns to article_family_content that the
 * ArticleFamilyContent collection has defined since the CMOS workflow gate was
 * added, but which never received a migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "article_family_content" ADD COLUMN IF NOT EXISTS "quality_gate_snapshot" jsonb;
    ALTER TABLE "article_family_content" ADD COLUMN IF NOT EXISTS "quality_waiver" jsonb;
    ALTER TABLE "article_family_content" ADD COLUMN IF NOT EXISTS "review_decisions" jsonb DEFAULT '[]'::jsonb NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "article_family_content" DROP COLUMN IF EXISTS "review_decisions";
    ALTER TABLE "article_family_content" DROP COLUMN IF EXISTS "quality_waiver";
    ALTER TABLE "article_family_content" DROP COLUMN IF EXISTS "quality_gate_snapshot";
  `)
}

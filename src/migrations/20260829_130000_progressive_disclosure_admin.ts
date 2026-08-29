import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Stores only owner-controlled presentation choices; no capability data is removed. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "site_settings"
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_media_processing" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_social_distribution" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_transactional_email" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_commerce_checkout" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_analytics_reporting" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_experiments" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_quality_scanning" boolean DEFAULT false;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "site_settings"
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_media_processing",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_social_distribution",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_transactional_email",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_commerce_checkout",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_analytics_reporting",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_experiments",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_quality_scanning";
  `)
}

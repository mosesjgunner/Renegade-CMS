import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "onboarding_primary_url" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_locale" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_timezone" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_feature_profile" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_starter_type" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_starter_content" boolean DEFAULT true;`)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "onboarding_primary_url", DROP COLUMN IF EXISTS "onboarding_locale", DROP COLUMN IF EXISTS "onboarding_timezone", DROP COLUMN IF EXISTS "onboarding_feature_profile", DROP COLUMN IF EXISTS "onboarding_starter_type", DROP COLUMN IF EXISTS "onboarding_starter_content";`,
  )
}

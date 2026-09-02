import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * PUB-04 adds publisher floor controls to site_settings:
 * - site_name, site_description, canonical_origin, locale, timezone
 * - footer_text, indexing_mode ('index' | 'noindex')
 * - homepage_selection (mode, page_id, layout_id)
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "site_name" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "site_description" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "canonical_origin" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "locale" varchar DEFAULT 'en';
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "timezone" varchar DEFAULT 'UTC';
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "footer_text" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "indexing_mode" varchar DEFAULT 'index';
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "homepage_selection_mode" varchar DEFAULT 'default';
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "homepage_selection_page_id" uuid;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "homepage_selection_layout_id" uuid;

    DO $$ BEGIN
      ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_homepage_page_fk"
        FOREIGN KEY ("homepage_selection_page_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_homepage_layout_fk"
        FOREIGN KEY ("homepage_selection_layout_id") REFERENCES "public"."page_layouts"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    UPDATE "site_settings"
    SET "site_name" = COALESCE("site_name", "default_title", "organization_name", 'Renegade CMS'),
        "site_description" = COALESCE("site_description", "default_description", ''),
        "canonical_origin" = COALESCE("canonical_origin", "onboarding_primary_url", 'http://localhost:3000'),
        "locale" = COALESCE("locale", "onboarding_locale", 'en'),
        "timezone" = COALESCE("timezone", "onboarding_timezone", 'UTC'),
        "indexing_mode" = CASE WHEN "seo_no_index" = true THEN 'noindex' ELSE 'index' END
    WHERE "id" IS NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "site_name";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "site_description";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "canonical_origin";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "locale";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "timezone";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "footer_text";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "indexing_mode";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "homepage_selection_mode";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "homepage_selection_page_id";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "homepage_selection_layout_id";
  `)
}

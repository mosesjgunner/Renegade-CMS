import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Add shared editable SEO fields to taxonomy (sections, categories, topics, tags, series) and page_layouts. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS "sections"
      ADD COLUMN IF NOT EXISTS "seo_title" varchar,
      ADD COLUMN IF NOT EXISTS "seo_description" varchar,
      ADD COLUMN IF NOT EXISTS "seo_canonical_u_r_l" varchar,
      ADD COLUMN IF NOT EXISTS "seo_image_alt" varchar,
      ADD COLUMN IF NOT EXISTS "seo_keywords" jsonb,
      ADD COLUMN IF NOT EXISTS "seo_focus_keyphrase" varchar,
      ADD COLUMN IF NOT EXISTS "seo_no_index" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;

    ALTER TABLE IF EXISTS "categories"
      ADD COLUMN IF NOT EXISTS "seo_title" varchar,
      ADD COLUMN IF NOT EXISTS "seo_description" varchar,
      ADD COLUMN IF NOT EXISTS "seo_canonical_u_r_l" varchar,
      ADD COLUMN IF NOT EXISTS "seo_image_alt" varchar,
      ADD COLUMN IF NOT EXISTS "seo_keywords" jsonb,
      ADD COLUMN IF NOT EXISTS "seo_focus_keyphrase" varchar,
      ADD COLUMN IF NOT EXISTS "seo_no_index" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;

    ALTER TABLE IF EXISTS "topics"
      ADD COLUMN IF NOT EXISTS "seo_title" varchar,
      ADD COLUMN IF NOT EXISTS "seo_description" varchar,
      ADD COLUMN IF NOT EXISTS "seo_canonical_u_r_l" varchar,
      ADD COLUMN IF NOT EXISTS "seo_image_alt" varchar,
      ADD COLUMN IF NOT EXISTS "seo_keywords" jsonb,
      ADD COLUMN IF NOT EXISTS "seo_focus_keyphrase" varchar,
      ADD COLUMN IF NOT EXISTS "seo_no_index" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;

    ALTER TABLE IF EXISTS "tags"
      ADD COLUMN IF NOT EXISTS "seo_title" varchar,
      ADD COLUMN IF NOT EXISTS "seo_description" varchar,
      ADD COLUMN IF NOT EXISTS "seo_canonical_u_r_l" varchar,
      ADD COLUMN IF NOT EXISTS "seo_image_alt" varchar,
      ADD COLUMN IF NOT EXISTS "seo_keywords" jsonb,
      ADD COLUMN IF NOT EXISTS "seo_focus_keyphrase" varchar,
      ADD COLUMN IF NOT EXISTS "seo_no_index" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;

    ALTER TABLE IF EXISTS "series"
      ADD COLUMN IF NOT EXISTS "seo_title" varchar,
      ADD COLUMN IF NOT EXISTS "seo_description" varchar,
      ADD COLUMN IF NOT EXISTS "seo_canonical_u_r_l" varchar,
      ADD COLUMN IF NOT EXISTS "seo_image_alt" varchar,
      ADD COLUMN IF NOT EXISTS "seo_keywords" jsonb,
      ADD COLUMN IF NOT EXISTS "seo_focus_keyphrase" varchar,
      ADD COLUMN IF NOT EXISTS "seo_no_index" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;

    ALTER TABLE IF EXISTS "page_layouts"
      ADD COLUMN IF NOT EXISTS "seo_title" varchar,
      ADD COLUMN IF NOT EXISTS "seo_description" varchar,
      ADD COLUMN IF NOT EXISTS "seo_canonical_u_r_l" varchar,
      ADD COLUMN IF NOT EXISTS "seo_image_alt" varchar,
      ADD COLUMN IF NOT EXISTS "seo_keywords" jsonb,
      ADD COLUMN IF NOT EXISTS "seo_focus_keyphrase" varchar,
      ADD COLUMN IF NOT EXISTS "seo_no_index" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS "page_layouts"
      DROP COLUMN IF EXISTS "discovery_overrides",
      DROP COLUMN IF EXISTS "seo_no_index",
      DROP COLUMN IF EXISTS "seo_focus_keyphrase",
      DROP COLUMN IF EXISTS "seo_keywords",
      DROP COLUMN IF EXISTS "seo_image_alt",
      DROP COLUMN IF EXISTS "seo_canonical_u_r_l",
      DROP COLUMN IF EXISTS "seo_description",
      DROP COLUMN IF EXISTS "seo_title";

    ALTER TABLE IF EXISTS "series"
      DROP COLUMN IF EXISTS "discovery_overrides",
      DROP COLUMN IF EXISTS "seo_no_index",
      DROP COLUMN IF EXISTS "seo_focus_keyphrase",
      DROP COLUMN IF EXISTS "seo_keywords",
      DROP COLUMN IF EXISTS "seo_image_alt",
      DROP COLUMN IF EXISTS "seo_canonical_u_r_l",
      DROP COLUMN IF EXISTS "seo_description",
      DROP COLUMN IF EXISTS "seo_title";

    ALTER TABLE IF EXISTS "tags"
      DROP COLUMN IF EXISTS "discovery_overrides",
      DROP COLUMN IF EXISTS "seo_no_index",
      DROP COLUMN IF EXISTS "seo_focus_keyphrase",
      DROP COLUMN IF EXISTS "seo_keywords",
      DROP COLUMN IF EXISTS "seo_image_alt",
      DROP COLUMN IF EXISTS "seo_canonical_u_r_l",
      DROP COLUMN IF EXISTS "seo_description",
      DROP COLUMN IF EXISTS "seo_title";

    ALTER TABLE IF EXISTS "topics"
      DROP COLUMN IF EXISTS "discovery_overrides",
      DROP COLUMN IF EXISTS "seo_no_index",
      DROP COLUMN IF EXISTS "seo_focus_keyphrase",
      DROP COLUMN IF EXISTS "seo_keywords",
      DROP COLUMN IF EXISTS "seo_image_alt",
      DROP COLUMN IF EXISTS "seo_canonical_u_r_l",
      DROP COLUMN IF EXISTS "seo_description",
      DROP COLUMN IF EXISTS "seo_title";

    ALTER TABLE IF EXISTS "categories"
      DROP COLUMN IF EXISTS "discovery_overrides",
      DROP COLUMN IF EXISTS "seo_no_index",
      DROP COLUMN IF EXISTS "seo_focus_keyphrase",
      DROP COLUMN IF EXISTS "seo_keywords",
      DROP COLUMN IF EXISTS "seo_image_alt",
      DROP COLUMN IF EXISTS "seo_canonical_u_r_l",
      DROP COLUMN IF EXISTS "seo_description",
      DROP COLUMN IF EXISTS "seo_title";

    ALTER TABLE IF EXISTS "sections"
      DROP COLUMN IF EXISTS "discovery_overrides",
      DROP COLUMN IF EXISTS "seo_no_index",
      DROP COLUMN IF EXISTS "seo_focus_keyphrase",
      DROP COLUMN IF EXISTS "seo_keywords",
      DROP COLUMN IF EXISTS "seo_image_alt",
      DROP COLUMN IF EXISTS "seo_canonical_u_r_l",
      DROP COLUMN IF EXISTS "seo_description",
      DROP COLUMN IF EXISTS "seo_title";
  `)
}

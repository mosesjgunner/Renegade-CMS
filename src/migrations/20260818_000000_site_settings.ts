import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "site_settings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "owner_kind" varchar DEFAULT 'organization' NOT NULL,
      "organization_name" varchar,
      "person_name" varchar,
      "legal_name" varchar,
      "default_title" varchar NOT NULL,
      "default_description" varchar,
      "logo_id" uuid,
      "favicon_id" uuid,
      "default_social_image_id" uuid,
      "same_as" jsonb,
      "contact_defaults" jsonb,
      "social_handles" jsonb,
      "site_verification" jsonb,
      "robots_defaults" jsonb,
      "search_action_enabled" boolean DEFAULT false,
      "search_action_target_template" varchar DEFAULT '/search?q={search_term_string}',
      "organization_defaults" jsonb,
      "person_defaults" jsonb,
      "inheritance_policy" varchar DEFAULT 'site-publication-brand' NOT NULL,
      "seo_title" varchar,
      "seo_description" varchar,
      "seo_canonical_u_r_l" varchar,
      "seo_image_alt" varchar,
      "seo_keywords" jsonb,
      "seo_focus_keyphrase" varchar,
      "seo_no_index" boolean DEFAULT false,
      "structured_data_mode" varchar DEFAULT 'none' NOT NULL,
      "structured_data_primary_type" varchar,
      "structured_data_source_collection" varchar,
      "structured_data_source_identifier" varchar,
      "structured_data_manual" jsonb,
      "structured_data_version" numeric DEFAULT 1,
      "raw_structured_data_override" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "site_settings";`)
}

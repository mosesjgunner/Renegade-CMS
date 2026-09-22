import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** AUD-03 is additive: existing block emails continue to render through the legacy safe renderer. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "email_templates" ("id" serial PRIMARY KEY, "site_id" integer, "name" varchar NOT NULL, "version" varchar NOT NULL, "locale" varchar DEFAULT 'en', "brand_tokens" jsonb DEFAULT '{}'::jsonb, "registered_blocks" jsonb DEFAULT '[]'::jsonb, "layout_regions" jsonb DEFAULT '[]'::jsonb, "plain_text_strategy" varchar DEFAULT 'generated', "status" varchar DEFAULT 'draft', "created_at" timestamp(3) with time zone DEFAULT now(), "updated_at" timestamp(3) with time zone DEFAULT now());
    CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_site_name_version_idx" ON "email_templates" ("site_id", "name", "version");
    ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "preheader" varchar, ADD COLUMN IF NOT EXISTS "sender_identity" jsonb, ADD COLUMN IF NOT EXISTS "purpose" varchar DEFAULT 'newsletter', ADD COLUMN IF NOT EXISTS "channel" varchar DEFAULT 'email', ADD COLUMN IF NOT EXISTS "language" varchar DEFAULT 'en', ADD COLUMN IF NOT EXISTS "message_design" jsonb, ADD COLUMN IF NOT EXISTS "email_template_id" integer, ADD COLUMN IF NOT EXISTS "template_version" varchar, ADD COLUMN IF NOT EXISTS "variant_key" varchar DEFAULT 'control', ADD COLUMN IF NOT EXISTS "parent_message_id" integer, ADD COLUMN IF NOT EXISTS "approved_render" jsonb, ADD COLUMN IF NOT EXISTS "approval_invalidated_at" timestamp(3) with time zone;
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "email_templates";`)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_page_layouts_surface" ADD VALUE IF NOT EXISTS 'template';
    ALTER TYPE "public"."enum_page_layouts_surface" ADD VALUE IF NOT EXISTS 'pattern';
    ALTER TYPE "public"."enum_page_layouts_slot" ADD VALUE IF NOT EXISTS 'announcement';
    ALTER TYPE "public"."enum_page_layouts_slot" ADD VALUE IF NOT EXISTS 'cta';

    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS name varchar;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS template_id varchar;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS template_version numeric;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS template_mode varchar;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS is_retired boolean DEFAULT false NOT NULL;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS category varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS category;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS is_retired;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS template_mode;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS template_version;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS template_id;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS name;
  `)
}

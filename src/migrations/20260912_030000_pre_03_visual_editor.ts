import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN CREATE TYPE "public"."enum_page_layouts_surface" AS ENUM('page', 'global');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_page_layouts_slot" AS ENUM('main', 'header', 'footer');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS surface "enum_page_layouts_surface" DEFAULT 'page' NOT NULL;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS slot "enum_page_layouts_slot" DEFAULT 'main' NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS slot;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS surface;
    DROP TYPE IF EXISTS "public"."enum_page_layouts_slot";
    DROP TYPE IF EXISTS "public"."enum_page_layouts_surface";
  `)
}

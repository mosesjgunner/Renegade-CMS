import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_page_layouts_theme_id" AS ENUM('neutral-starter', 'renegade-party');
  CREATE TYPE "public"."enum_page_layouts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_page_layouts_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_page_layouts_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_page_layouts_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TABLE "page_layouts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"path" varchar NOT NULL,
  	"theme_id" "enum_page_layouts_theme_id" DEFAULT 'neutral-starter' NOT NULL,
  	"layout_version" numeric DEFAULT 1 NOT NULL,
  	"status" "enum_page_layouts_status" DEFAULT 'draft' NOT NULL,
  	"visibility" "enum_page_layouts_visibility" DEFAULT 'public' NOT NULL,
  	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"unknown_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"revision" numeric DEFAULT 1 NOT NULL,
  	"published_revision" numeric,
  	"revision_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"retention_mode" "enum_page_layouts_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_page_layouts_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "page_layouts_id" uuid;
  ALTER TABLE "page_layouts" ADD CONSTRAINT "page_layouts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_layouts" ADD CONSTRAINT "page_layouts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_layouts" ADD CONSTRAINT "page_layouts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "page_layouts_site_idx" ON "page_layouts" USING btree ("site_id");
  CREATE INDEX "page_layouts_publication_idx" ON "page_layouts" USING btree ("publication_id");
  CREATE INDEX "page_layouts_space_idx" ON "page_layouts" USING btree ("space_id");
  CREATE INDEX "page_layouts_path_idx" ON "page_layouts" USING btree ("path");
  CREATE INDEX "page_layouts_updated_at_idx" ON "page_layouts" USING btree ("updated_at");
  CREATE INDEX "page_layouts_created_at_idx" ON "page_layouts" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_path_idx" ON "page_layouts" USING btree ("site_id","path");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_page_layouts_fk" FOREIGN KEY ("page_layouts_id") REFERENCES "public"."page_layouts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_page_layouts_id_idx" ON "payload_locked_documents_rels" USING btree ("page_layouts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "page_layouts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "page_layouts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_page_layouts_fk";
  
  DROP INDEX "payload_locked_documents_rels_page_layouts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "page_layouts_id";
  DROP TYPE "public"."enum_page_layouts_theme_id";
  DROP TYPE "public"."enum_page_layouts_status";
  DROP TYPE "public"."enum_page_layouts_visibility";
  DROP TYPE "public"."enum_page_layouts_retention_mode";
  DROP TYPE "public"."enum_page_layouts_retention_hold";`)
}

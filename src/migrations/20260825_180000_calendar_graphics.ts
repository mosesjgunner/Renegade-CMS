import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Prompt 10 canonical scheduling and governed graphics additions. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_content_releases_status" AS ENUM('draft', 'scheduled', 'released', 'cancelled');
    CREATE TYPE "public"."enum_media_assets_rights_status" AS ENUM('pending', 'approved', 'restricted', 'expired');
    CREATE TABLE "content_releases" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL, "publication_id" uuid, "space_id" uuid, "owner_id" uuid,
      "title" varchar NOT NULL, "content_id" uuid, "article_id" uuid,
      "scheduled_for" timestamp(3) with time zone, "time_zone" varchar DEFAULT 'UTC',
      "status" "enum_content_releases_status" DEFAULT 'draft', "last_schedule_mutation_id" varchar,
      "schedule_audit" jsonb DEFAULT '[]'::jsonb, "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "media_assets" ADD COLUMN "rights_status" "enum_media_assets_rights_status" DEFAULT 'approved';
    ALTER TABLE "graphic_documents" ADD COLUMN "site_id" uuid, ADD COLUMN "publication_id" uuid, ADD COLUMN "space_id" uuid, ADD COLUMN "owner_id" uuid, ADD COLUMN "template" varchar, ADD COLUMN "layout_variant" varchar;
    ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "content_releases_scheduled_for_idx" ON "content_releases" USING btree ("scheduled_for");
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "content_releases" CASCADE;
    ALTER TABLE "media_assets" DROP COLUMN "rights_status";
    ALTER TABLE "graphic_documents" DROP COLUMN "site_id", DROP COLUMN "publication_id", DROP COLUMN "space_id", DROP COLUMN "owner_id", DROP COLUMN "template", DROP COLUMN "layout_variant";
    DROP TYPE "public"."enum_content_releases_status";
    DROP TYPE "public"."enum_media_assets_rights_status";
  `)
}

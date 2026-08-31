import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_analytics_enabled" boolean DEFAULT false NOT NULL;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_consent_version" varchar DEFAULT '2026-08-31' NOT NULL;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_respect_global_privacy_control" boolean DEFAULT true NOT NULL;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_respect_do_not_track" boolean DEFAULT true NOT NULL;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_raw_event_retention_days" numeric DEFAULT 90 NOT NULL;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_rollup_retention_days" numeric DEFAULT 730 NOT NULL;
    CREATE TYPE "public"."enum_analytics_consent_records_action" AS ENUM('grant', 'update', 'withdraw');
    CREATE TABLE "analytics_consent_records" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE set null,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE set null,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE set null,
      "subject_hash" varchar NOT NULL, "consent_version" varchar NOT NULL,
      "action" "enum_analytics_consent_records_action" NOT NULL, "categories" jsonb NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL, "source" varchar NOT NULL DEFAULT 'browser',
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX "analytics_consent_records_site_subject_occurred_idx" ON "analytics_consent_records" USING btree ("site_id", "subject_hash", "occurred_at");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "analytics_consent_records_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_consent_records_fk" FOREIGN KEY ("analytics_consent_records_id") REFERENCES "analytics_consent_records"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_analytics_consent_records_id_idx" ON "payload_locked_documents_rels" ("analytics_consent_records_id");
  `)
}
export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Analytics privacy records are immutable audit evidence; use a reviewed retention migration.',
  )
}

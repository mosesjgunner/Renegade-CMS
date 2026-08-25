import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_content_public_change_history_policy" AS ENUM('hidden', 'summary', 'full');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_article_family_content_preview_modes" AS ENUM('desktop', 'mobile');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_article_family_content_permissions_actions" AS ENUM('read', 'edit', 'request-review', 'review', 'approve', 'schedule', 'publish');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_article_family_content_source_references_public_visibility" AS ENUM('public', 'staff');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_article_family_content_citation_attachments_role" AS ENUM('excerpt', 'scan', 'transcript', 'supporting-document');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_article_family_content_lifecycle" AS ENUM('draft', 'review', 'approved', 'scheduled', 'published', 'updated', 'archived', 'rejected');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_markdown_conversion_reports_status" AS ENUM('accepted', 'accepted-with-warnings', 'rejected');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_revision_records_reason" AS ENUM('created', 'edited', 'reviewed', 'published', 'restored', 'imported');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_preview_tokens_scope" AS ENUM('article-preview');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_scheduled_publish_jobs_status" AS ENUM('pending-contract', 'queued', 'completed', 'cancelled', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TYPE "public"."enum_content_status" ADD VALUE IF NOT EXISTS 'approved';
    ALTER TYPE "public"."enum_content_status" ADD VALUE IF NOT EXISTS 'updated';
    ALTER TYPE "public"."enum_content_status" ADD VALUE IF NOT EXISTS 'rejected';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'editorial-publish';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'editorial-publish';

    CREATE TABLE IF NOT EXISTS "content_correction_notices" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar NOT NULL,
      "detail" varchar NOT NULL,
      "issued_at" timestamp(3) with time zone NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "content_change_notes" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "summary" varchar NOT NULL,
      "issued_at" timestamp(3) with time zone NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "article_family_content" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "content_id" uuid NOT NULL,
      "article_key" varchar NOT NULL,
      "lifecycle" "enum_article_family_content_lifecycle" DEFAULT 'draft' NOT NULL,
      "document" jsonb NOT NULL,
      "document_hash" varchar NOT NULL,
      "plain_text_projection" varchar NOT NULL,
      "current_revision_sequence" numeric DEFAULT 1 NOT NULL,
      "current_revision_id" uuid,
      "latest_published_revision_id" uuid,
      "first_published_at" timestamp(3) with time zone,
      "last_previewed_at" timestamp(3) with time zone,
      "bibliography" jsonb,
      "workflow_audit" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "accepted_mutation_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "revision_comparison" jsonb,
      "promotion_provenance" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_preview_modes" (
      "order" integer NOT NULL,
      "parent_id" uuid NOT NULL,
      "value" "enum_article_family_content_preview_modes",
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_permissions" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "user_id" uuid NOT NULL,
      "granted_at" timestamp(3) with time zone NOT NULL,
      "expires_at" timestamp(3) with time zone
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_permissions_actions" (
      "order" integer NOT NULL,
      "parent_id" varchar NOT NULL,
      "value" "enum_article_family_content_permissions_actions",
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_source_references" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "source_reference_id" varchar NOT NULL,
      "source_id" uuid NOT NULL,
      "locator" varchar,
      "bibliography_key" varchar NOT NULL,
      "public_visibility" "enum_article_family_content_source_references_public_visibility" DEFAULT 'public' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_citations" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "citation_id" varchar NOT NULL,
      "source_reference_id" varchar NOT NULL,
      "node_key" varchar NOT NULL,
      "offset_start" numeric NOT NULL,
      "offset_end" numeric NOT NULL,
      "ordinal" numeric NOT NULL,
      "passage_checksum" varchar
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_citation_attachments" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "citation_id" varchar NOT NULL,
      "media_id" uuid NOT NULL,
      "role" "enum_article_family_content_citation_attachments_role" NOT NULL,
      "checksum" varchar NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "markdown_conversion_reports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "article_id" uuid,
      "source_checksum" varchar NOT NULL,
      "target_document_hash" varchar,
      "format_version" numeric DEFAULT 1 NOT NULL,
      "status" "enum_markdown_conversion_reports_status" NOT NULL,
      "fidelity_boundary" jsonb NOT NULL,
      "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "unsupported_constructs" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "created_by_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "revision_records" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "article_id" uuid NOT NULL,
      "parent_revision_id" uuid,
      "restored_from_revision_id" uuid,
      "sequence" numeric NOT NULL,
      "document" jsonb NOT NULL,
      "document_hash" varchar NOT NULL,
      "integrity_hash" varchar NOT NULL,
      "reason" "enum_revision_records_reason" NOT NULL,
      "immutable" boolean DEFAULT true NOT NULL,
      "created_by_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "preview_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "article_id" uuid NOT NULL,
      "revision_id" uuid,
      "token_hash" varchar NOT NULL,
      "scope" "enum_preview_tokens_scope" DEFAULT 'article-preview' NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "revoked_at" timestamp(3) with time zone,
      "created_by_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "scheduled_publish_jobs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "article_id" uuid NOT NULL,
      "job_id" uuid,
      "revision_id" uuid NOT NULL,
      "scheduled_for" timestamp(3) with time zone NOT NULL,
      "time_zone" varchar NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "status" "enum_scheduled_publish_jobs_status" DEFAULT 'pending-contract' NOT NULL,
      "created_by_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "content"
      ADD COLUMN IF NOT EXISTS "subtitle" varchar,
      ADD COLUMN IF NOT EXISTS "excerpt" varchar,
      ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "pinned" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "reading_time_minutes" numeric,
      ADD COLUMN IF NOT EXISTS "table_of_contents" jsonb,
      ADD COLUMN IF NOT EXISTS "public_change_history_policy" "enum_content_public_change_history_policy" DEFAULT 'summary' NOT NULL;

    ALTER TABLE "content_rels"
      ADD COLUMN IF NOT EXISTS "content_id" uuid;

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "article_family_content_id" uuid,
      ADD COLUMN IF NOT EXISTS "markdown_conversion_reports_id" uuid,
      ADD COLUMN IF NOT EXISTS "revision_records_id" uuid,
      ADD COLUMN IF NOT EXISTS "preview_tokens_id" uuid,
      ADD COLUMN IF NOT EXISTS "scheduled_publish_jobs_id" uuid;

    DO $$ BEGIN
      ALTER TABLE "content_correction_notices" ADD CONSTRAINT "content_correction_notices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "content_change_notes" ADD CONSTRAINT "content_change_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_preview_modes" ADD CONSTRAINT "article_family_content_preview_modes_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_permissions" ADD CONSTRAINT "article_family_content_permissions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_permissions" ADD CONSTRAINT "article_family_content_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_permissions_actions" ADD CONSTRAINT "article_family_content_permissions_actions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."article_family_content_permissions"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_source_references" ADD CONSTRAINT "article_family_content_source_references_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_source_references" ADD CONSTRAINT "article_family_content_source_references_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_citations" ADD CONSTRAINT "article_family_content_citations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_citation_attachments" ADD CONSTRAINT "article_family_content_citation_attachments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_citation_attachments" ADD CONSTRAINT "article_family_content_citation_attachments_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content" ADD CONSTRAINT "article_family_content_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "revision_records" ADD CONSTRAINT "revision_records_article_id_article_family_content_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article_family_content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "revision_records" ADD CONSTRAINT "revision_records_parent_revision_id_revision_records_id_fk" FOREIGN KEY ("parent_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "revision_records" ADD CONSTRAINT "revision_records_restored_from_revision_id_revision_records_id_fk" FOREIGN KEY ("restored_from_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "revision_records" ADD CONSTRAINT "revision_records_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content" ADD CONSTRAINT "article_family_content_current_revision_id_revision_records_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content" ADD CONSTRAINT "article_family_content_latest_published_revision_id_revision_records_id_fk" FOREIGN KEY ("latest_published_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "markdown_conversion_reports" ADD CONSTRAINT "markdown_conversion_reports_article_id_article_family_content_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article_family_content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "markdown_conversion_reports" ADD CONSTRAINT "markdown_conversion_reports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "preview_tokens" ADD CONSTRAINT "preview_tokens_article_id_article_family_content_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article_family_content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "preview_tokens" ADD CONSTRAINT "preview_tokens_revision_id_revision_records_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "preview_tokens" ADD CONSTRAINT "preview_tokens_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "scheduled_publish_jobs" ADD CONSTRAINT "scheduled_publish_jobs_article_id_article_family_content_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article_family_content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "scheduled_publish_jobs" ADD CONSTRAINT "scheduled_publish_jobs_job_id_payload_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."payload_jobs"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "scheduled_publish_jobs" ADD CONSTRAINT "scheduled_publish_jobs_revision_id_revision_records_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "scheduled_publish_jobs" ADD CONSTRAINT "scheduled_publish_jobs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_article_family_content_fk" FOREIGN KEY ("article_family_content_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_markdown_conversion_reports_fk" FOREIGN KEY ("markdown_conversion_reports_id") REFERENCES "public"."markdown_conversion_reports"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_revision_records_fk" FOREIGN KEY ("revision_records_id") REFERENCES "public"."revision_records"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_preview_tokens_fk" FOREIGN KEY ("preview_tokens_id") REFERENCES "public"."preview_tokens"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scheduled_publish_jobs_fk" FOREIGN KEY ("scheduled_publish_jobs_id") REFERENCES "public"."scheduled_publish_jobs"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE INDEX IF NOT EXISTS "content_correction_notices_order_idx" ON "content_correction_notices" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "content_correction_notices_parent_id_idx" ON "content_correction_notices" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "content_change_notes_order_idx" ON "content_change_notes" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "content_change_notes_parent_id_idx" ON "content_change_notes" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_preview_modes_order_idx" ON "article_family_content_preview_modes" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "article_family_content_preview_modes_parent_idx" ON "article_family_content_preview_modes" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_permissions_order_idx" ON "article_family_content_permissions" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "article_family_content_permissions_parent_id_idx" ON "article_family_content_permissions" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_permissions_user_idx" ON "article_family_content_permissions" USING btree ("user_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_permissions_actions_order_idx" ON "article_family_content_permissions_actions" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "article_family_content_permissions_actions_parent_idx" ON "article_family_content_permissions_actions" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_source_references_order_idx" ON "article_family_content_source_references" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "article_family_content_source_references_parent_id_idx" ON "article_family_content_source_references" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_source_references_source_idx" ON "article_family_content_source_references" USING btree ("source_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_citations_order_idx" ON "article_family_content_citations" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "article_family_content_citations_parent_id_idx" ON "article_family_content_citations" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_citation_attachments_order_idx" ON "article_family_content_citation_attachments" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "article_family_content_citation_attachments_parent_id_idx" ON "article_family_content_citation_attachments" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_citation_attachments_media_idx" ON "article_family_content_citation_attachments" USING btree ("media_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "article_family_content_content_idx" ON "article_family_content" USING btree ("content_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "article_family_content_article_key_idx" ON "article_family_content" USING btree ("article_key");
    CREATE INDEX IF NOT EXISTS "article_family_content_current_revision_idx" ON "article_family_content" USING btree ("current_revision_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_latest_published_revision_idx" ON "article_family_content" USING btree ("latest_published_revision_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_updated_at_idx" ON "article_family_content" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "article_family_content_created_at_idx" ON "article_family_content" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "markdown_conversion_reports_article_idx" ON "markdown_conversion_reports" USING btree ("article_id");
    CREATE INDEX IF NOT EXISTS "markdown_conversion_reports_source_checksum_idx" ON "markdown_conversion_reports" USING btree ("source_checksum");
    CREATE INDEX IF NOT EXISTS "markdown_conversion_reports_created_by_idx" ON "markdown_conversion_reports" USING btree ("created_by_id");
    CREATE INDEX IF NOT EXISTS "markdown_conversion_reports_updated_at_idx" ON "markdown_conversion_reports" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "markdown_conversion_reports_created_at_idx" ON "markdown_conversion_reports" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "revision_records_article_idx" ON "revision_records" USING btree ("article_id");
    CREATE INDEX IF NOT EXISTS "revision_records_parent_revision_idx" ON "revision_records" USING btree ("parent_revision_id");
    CREATE INDEX IF NOT EXISTS "revision_records_restored_from_revision_idx" ON "revision_records" USING btree ("restored_from_revision_id");
    CREATE INDEX IF NOT EXISTS "revision_records_created_by_idx" ON "revision_records" USING btree ("created_by_id");
    CREATE INDEX IF NOT EXISTS "revision_records_updated_at_idx" ON "revision_records" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "revision_records_created_at_idx" ON "revision_records" USING btree ("created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "article_sequence_idx" ON "revision_records" USING btree ("article_id", "sequence");
    CREATE INDEX IF NOT EXISTS "preview_tokens_article_idx" ON "preview_tokens" USING btree ("article_id");
    CREATE INDEX IF NOT EXISTS "preview_tokens_revision_idx" ON "preview_tokens" USING btree ("revision_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "preview_tokens_token_hash_idx" ON "preview_tokens" USING btree ("token_hash");
    CREATE INDEX IF NOT EXISTS "preview_tokens_created_by_idx" ON "preview_tokens" USING btree ("created_by_id");
    CREATE INDEX IF NOT EXISTS "preview_tokens_updated_at_idx" ON "preview_tokens" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "preview_tokens_created_at_idx" ON "preview_tokens" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_article_idx" ON "scheduled_publish_jobs" USING btree ("article_id");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_job_idx" ON "scheduled_publish_jobs" USING btree ("job_id");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_revision_idx" ON "scheduled_publish_jobs" USING btree ("revision_id");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_scheduled_for_idx" ON "scheduled_publish_jobs" USING btree ("scheduled_for");
    CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_publish_jobs_idempotency_key_idx" ON "scheduled_publish_jobs" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_created_by_idx" ON "scheduled_publish_jobs" USING btree ("created_by_id");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_updated_at_idx" ON "scheduled_publish_jobs" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_created_at_idx" ON "scheduled_publish_jobs" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "content_rels_content_id_idx" ON "content_rels" USING btree ("content_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_article_family_content_id_idx" ON "payload_locked_documents_rels" USING btree ("article_family_content_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_markdown_conversion_report_idx" ON "payload_locked_documents_rels" USING btree ("markdown_conversion_reports_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_revision_records_id_idx" ON "payload_locked_documents_rels" USING btree ("revision_records_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_preview_tokens_id_idx" ON "payload_locked_documents_rels" USING btree ("preview_tokens_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_scheduled_publish_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("scheduled_publish_jobs_id");
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    '20260818_062327_m04_c_editorial_workflow is additive and owned by editorial.m04; rollback requires reviewed manual data migration.',
  )
}

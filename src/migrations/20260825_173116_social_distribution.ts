import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_social_accounts_network" AS ENUM('activitypub', 'bluesky', 'x', 'threads', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'manual');
  CREATE TYPE "public"."enum_social_accounts_actor_type" AS ENUM('site', 'publication', 'space');
  CREATE TYPE "public"."enum_social_accounts_capability_state" AS ENUM('available', 'limited', 'approval-required', 'manual-handoff', 'unavailable');
  CREATE TYPE "public"."enum_social_accounts_credential_health" AS ENUM('healthy', 'expiring', 'expired', 'revoked', 'not-configured');
  CREATE TYPE "public"."enum_social_drafts_status" AS ENUM('draft', 'review', 'approved', 'queued', 'scheduled', 'publishing', 'published', 'partially-published', 'failed', 'cancelled', 'deletion-requested');
  CREATE TYPE "public"."enum_social_network_variants_network" AS ENUM('activitypub', 'bluesky', 'x', 'threads', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'manual');
  CREATE TYPE "public"."enum_social_network_variants_status" AS ENUM('draft', 'review', 'approved', 'queued', 'scheduled', 'publishing', 'published', 'partially-published', 'failed', 'cancelled', 'deletion-requested');
  CREATE TYPE "public"."enum_social_queue_items_status" AS ENUM('draft', 'review', 'approved', 'queued', 'scheduled', 'publishing', 'published', 'partially-published', 'failed', 'cancelled', 'deletion-requested');
  CREATE TYPE "public"."enum_social_publish_attempts_status" AS ENUM('started', 'published', 'failed', 'unknown');
  CREATE TYPE "public"."enum_external_posts_remote_state" AS ENUM('published', 'deleted', 'tombstoned', 'unknown', 'moderated');
  CREATE TYPE "public"."enum_campaigns_status" AS ENUM('draft', 'review', 'approved', 'queued', 'scheduled', 'publishing', 'published', 'partially-published', 'failed', 'cancelled', 'deletion-requested');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'social-publish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'social-publish';
  CREATE TABLE "social_accounts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"display_name" varchar NOT NULL,
  	"network" "enum_social_accounts_network" NOT NULL,
  	"actor_type" "enum_social_accounts_actor_type" NOT NULL,
  	"external_account_id" varchar NOT NULL,
  	"capability_state" "enum_social_accounts_capability_state" DEFAULT 'manual-handoff' NOT NULL,
  	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"credential_health" "enum_social_accounts_credential_health" DEFAULT 'not-configured',
  	"credential_expires_at" timestamp(3) with time zone,
  	"connection_reference" varchar,
  	"last_verified_at" timestamp(3) with time zone,
  	"diagnostics" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_drafts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"source_content_id" uuid,
  	"source_revision_id" uuid,
  	"campaign_id" uuid,
  	"status" "enum_social_drafts_status" DEFAULT 'draft' NOT NULL,
  	"requires_review" boolean DEFAULT true,
  	"provenance" jsonb,
  	"canonical_url" varchar,
  	"created_by_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_network_variants" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"draft_id" uuid NOT NULL,
  	"account_id" uuid NOT NULL,
  	"label" varchar NOT NULL,
  	"network" "enum_social_network_variants_network" NOT NULL,
  	"text" varchar NOT NULL,
  	"link_url" varchar,
  	"validation" jsonb DEFAULT '[]'::jsonb,
  	"status" "enum_social_network_variants_status" DEFAULT 'draft' NOT NULL,
  	"approval_hash" varchar,
  	"approved_at" timestamp(3) with time zone,
  	"approved_by_id" uuid,
  	"idempotency_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_network_variants_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_assets_id" uuid
  );
  
  CREATE TABLE "social_queue_items" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"account_id" uuid NOT NULL,
  	"scheduled_for" timestamp(3) with time zone NOT NULL,
  	"time_zone" varchar NOT NULL,
  	"status" "enum_social_queue_items_status" DEFAULT 'scheduled' NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"lease_until" timestamp(3) with time zone,
  	"lease_owner" varchar,
  	"attempt_count" numeric DEFAULT 0,
  	"next_attempt_at" timestamp(3) with time zone,
  	"dead_letter_reason" jsonb,
  	"cancelled_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_publish_attempts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"queue_item_id" uuid NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"attempt_number" numeric NOT NULL,
  	"status" "enum_social_publish_attempts_status" NOT NULL,
  	"request" jsonb,
  	"response" jsonb,
  	"error" jsonb,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"finished_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "external_posts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"account_id" uuid NOT NULL,
  	"remote_id" varchar NOT NULL,
  	"remote_url" varchar,
  	"remote_state" "enum_external_posts_remote_state" DEFAULT 'published',
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"delete_requested_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "campaigns" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"source_content_id" uuid,
  	"status" "enum_campaigns_status" DEFAULT 'draft' NOT NULL,
  	"launch_at" timestamp(3) with time zone,
  	"time_zone" varchar,
  	"goals" jsonb,
  	"newsletter_hook" jsonb,
  	"product_links" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "campaigns_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"graphic_documents_id" uuid
  );
  
  CREATE TABLE "calendar_entry_audits" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"calendar_entry_id" uuid NOT NULL,
  	"action" varchar NOT NULL,
  	"actor_id" uuid,
  	"before" jsonb,
  	"after" jsonb,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_accounts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_drafts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_network_variants_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_queue_items_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_publish_attempts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "external_posts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "campaigns_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "calendar_entry_audits_id" uuid;
  ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_source_content_id_content_id_fk" FOREIGN KEY ("source_content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_source_revision_id_revision_records_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_network_variants" ADD CONSTRAINT "social_network_variants_draft_id_social_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."social_drafts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_network_variants" ADD CONSTRAINT "social_network_variants_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_network_variants" ADD CONSTRAINT "social_network_variants_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_network_variants_rels" ADD CONSTRAINT "social_network_variants_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."social_network_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "social_network_variants_rels" ADD CONSTRAINT "social_network_variants_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "social_queue_items" ADD CONSTRAINT "social_queue_items_variant_id_social_network_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."social_network_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_queue_items" ADD CONSTRAINT "social_queue_items_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_publish_attempts" ADD CONSTRAINT "social_publish_attempts_queue_item_id_social_queue_items_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."social_queue_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_publish_attempts" ADD CONSTRAINT "social_publish_attempts_variant_id_social_network_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."social_network_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "external_posts" ADD CONSTRAINT "external_posts_variant_id_social_network_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."social_network_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "external_posts" ADD CONSTRAINT "external_posts_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_source_content_id_content_id_fk" FOREIGN KEY ("source_content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns_rels" ADD CONSTRAINT "campaigns_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "campaigns_rels" ADD CONSTRAINT "campaigns_rels_graphic_documents_fk" FOREIGN KEY ("graphic_documents_id") REFERENCES "public"."graphic_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_entry_audits" ADD CONSTRAINT "calendar_entry_audits_calendar_entry_id_calendar_entries_id_fk" FOREIGN KEY ("calendar_entry_id") REFERENCES "public"."calendar_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_entry_audits" ADD CONSTRAINT "calendar_entry_audits_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "social_accounts_site_idx" ON "social_accounts" USING btree ("site_id");
  CREATE INDEX "social_accounts_publication_idx" ON "social_accounts" USING btree ("publication_id");
  CREATE INDEX "social_accounts_space_idx" ON "social_accounts" USING btree ("space_id");
  CREATE INDEX "social_accounts_owner_idx" ON "social_accounts" USING btree ("owner_id");
  CREATE INDEX "social_accounts_updated_at_idx" ON "social_accounts" USING btree ("updated_at");
  CREATE INDEX "social_accounts_created_at_idx" ON "social_accounts" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_network_externalAccountId_idx" ON "social_accounts" USING btree ("site_id","network","external_account_id");
  CREATE INDEX "social_drafts_site_idx" ON "social_drafts" USING btree ("site_id");
  CREATE INDEX "social_drafts_publication_idx" ON "social_drafts" USING btree ("publication_id");
  CREATE INDEX "social_drafts_space_idx" ON "social_drafts" USING btree ("space_id");
  CREATE INDEX "social_drafts_owner_idx" ON "social_drafts" USING btree ("owner_id");
  CREATE INDEX "social_drafts_source_content_idx" ON "social_drafts" USING btree ("source_content_id");
  CREATE INDEX "social_drafts_source_revision_idx" ON "social_drafts" USING btree ("source_revision_id");
  CREATE INDEX "social_drafts_campaign_idx" ON "social_drafts" USING btree ("campaign_id");
  CREATE INDEX "social_drafts_created_by_idx" ON "social_drafts" USING btree ("created_by_id");
  CREATE INDEX "social_drafts_updated_at_idx" ON "social_drafts" USING btree ("updated_at");
  CREATE INDEX "social_drafts_created_at_idx" ON "social_drafts" USING btree ("created_at");
  CREATE INDEX "social_network_variants_draft_idx" ON "social_network_variants" USING btree ("draft_id");
  CREATE INDEX "social_network_variants_account_idx" ON "social_network_variants" USING btree ("account_id");
  CREATE INDEX "social_network_variants_approved_by_idx" ON "social_network_variants" USING btree ("approved_by_id");
  CREATE UNIQUE INDEX "social_network_variants_idempotency_key_idx" ON "social_network_variants" USING btree ("idempotency_key");
  CREATE INDEX "social_network_variants_updated_at_idx" ON "social_network_variants" USING btree ("updated_at");
  CREATE INDEX "social_network_variants_created_at_idx" ON "social_network_variants" USING btree ("created_at");
  CREATE INDEX "social_network_variants_rels_order_idx" ON "social_network_variants_rels" USING btree ("order");
  CREATE INDEX "social_network_variants_rels_parent_idx" ON "social_network_variants_rels" USING btree ("parent_id");
  CREATE INDEX "social_network_variants_rels_path_idx" ON "social_network_variants_rels" USING btree ("path");
  CREATE INDEX "social_network_variants_rels_media_assets_id_idx" ON "social_network_variants_rels" USING btree ("media_assets_id");
  CREATE INDEX "social_queue_items_variant_idx" ON "social_queue_items" USING btree ("variant_id");
  CREATE INDEX "social_queue_items_account_idx" ON "social_queue_items" USING btree ("account_id");
  CREATE INDEX "social_queue_items_scheduled_for_idx" ON "social_queue_items" USING btree ("scheduled_for");
  CREATE UNIQUE INDEX "social_queue_items_idempotency_key_idx" ON "social_queue_items" USING btree ("idempotency_key");
  CREATE INDEX "social_queue_items_updated_at_idx" ON "social_queue_items" USING btree ("updated_at");
  CREATE INDEX "social_queue_items_created_at_idx" ON "social_queue_items" USING btree ("created_at");
  CREATE INDEX "social_publish_attempts_queue_item_idx" ON "social_publish_attempts" USING btree ("queue_item_id");
  CREATE INDEX "social_publish_attempts_variant_idx" ON "social_publish_attempts" USING btree ("variant_id");
  CREATE INDEX "social_publish_attempts_idempotency_key_idx" ON "social_publish_attempts" USING btree ("idempotency_key");
  CREATE INDEX "social_publish_attempts_updated_at_idx" ON "social_publish_attempts" USING btree ("updated_at");
  CREATE INDEX "social_publish_attempts_created_at_idx" ON "social_publish_attempts" USING btree ("created_at");
  CREATE UNIQUE INDEX "external_posts_variant_idx" ON "external_posts" USING btree ("variant_id");
  CREATE INDEX "external_posts_account_idx" ON "external_posts" USING btree ("account_id");
  CREATE INDEX "external_posts_updated_at_idx" ON "external_posts" USING btree ("updated_at");
  CREATE INDEX "external_posts_created_at_idx" ON "external_posts" USING btree ("created_at");
  CREATE INDEX "campaigns_site_idx" ON "campaigns" USING btree ("site_id");
  CREATE INDEX "campaigns_publication_idx" ON "campaigns" USING btree ("publication_id");
  CREATE INDEX "campaigns_space_idx" ON "campaigns" USING btree ("space_id");
  CREATE INDEX "campaigns_owner_idx" ON "campaigns" USING btree ("owner_id");
  CREATE INDEX "campaigns_source_content_idx" ON "campaigns" USING btree ("source_content_id");
  CREATE INDEX "campaigns_updated_at_idx" ON "campaigns" USING btree ("updated_at");
  CREATE INDEX "campaigns_created_at_idx" ON "campaigns" USING btree ("created_at");
  CREATE INDEX "campaigns_rels_order_idx" ON "campaigns_rels" USING btree ("order");
  CREATE INDEX "campaigns_rels_parent_idx" ON "campaigns_rels" USING btree ("parent_id");
  CREATE INDEX "campaigns_rels_path_idx" ON "campaigns_rels" USING btree ("path");
  CREATE INDEX "campaigns_rels_graphic_documents_id_idx" ON "campaigns_rels" USING btree ("graphic_documents_id");
  CREATE INDEX "calendar_entry_audits_calendar_entry_idx" ON "calendar_entry_audits" USING btree ("calendar_entry_id");
  CREATE INDEX "calendar_entry_audits_actor_idx" ON "calendar_entry_audits" USING btree ("actor_id");
  CREATE INDEX "calendar_entry_audits_updated_at_idx" ON "calendar_entry_audits" USING btree ("updated_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_accounts_fk" FOREIGN KEY ("social_accounts_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_drafts_fk" FOREIGN KEY ("social_drafts_id") REFERENCES "public"."social_drafts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_network_variants_fk" FOREIGN KEY ("social_network_variants_id") REFERENCES "public"."social_network_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_queue_items_fk" FOREIGN KEY ("social_queue_items_id") REFERENCES "public"."social_queue_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_publish_attempts_fk" FOREIGN KEY ("social_publish_attempts_id") REFERENCES "public"."social_publish_attempts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_external_posts_fk" FOREIGN KEY ("external_posts_id") REFERENCES "public"."external_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_campaigns_fk" FOREIGN KEY ("campaigns_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_calendar_entry_audits_fk" FOREIGN KEY ("calendar_entry_audits_id") REFERENCES "public"."calendar_entry_audits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_social_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_accounts_id");
  CREATE INDEX "payload_locked_documents_rels_social_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_drafts_id");
  CREATE INDEX "payload_locked_documents_rels_social_network_variants_id_idx" ON "payload_locked_documents_rels" USING btree ("social_network_variants_id");
  CREATE INDEX "payload_locked_documents_rels_social_queue_items_id_idx" ON "payload_locked_documents_rels" USING btree ("social_queue_items_id");
  CREATE INDEX "payload_locked_documents_rels_social_publish_attempts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_publish_attempts_id");
  CREATE INDEX "payload_locked_documents_rels_external_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("external_posts_id");
  CREATE INDEX "payload_locked_documents_rels_campaigns_id_idx" ON "payload_locked_documents_rels" USING btree ("campaigns_id");
  CREATE INDEX "payload_locked_documents_rels_calendar_entry_audits_id_idx" ON "payload_locked_documents_rels" USING btree ("calendar_entry_audits_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "social_accounts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_drafts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_network_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_network_variants_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_queue_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_publish_attempts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "external_posts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "campaigns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "campaigns_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "calendar_entry_audits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "social_accounts" CASCADE;
  DROP TABLE "social_drafts" CASCADE;
  DROP TABLE "social_network_variants" CASCADE;
  DROP TABLE "social_network_variants_rels" CASCADE;
  DROP TABLE "social_queue_items" CASCADE;
  DROP TABLE "social_publish_attempts" CASCADE;
  DROP TABLE "external_posts" CASCADE;
  DROP TABLE "campaigns" CASCADE;
  DROP TABLE "campaigns_rels" CASCADE;
  DROP TABLE "calendar_entry_audits" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_accounts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_drafts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_network_variants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_queue_items_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_publish_attempts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_external_posts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_campaigns_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_calendar_entry_audits_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish', 'media-import', 'media-render', 'media-transcribe', 'media-tts');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish', 'media-import', 'media-render', 'media-transcribe', 'media-tts');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_social_accounts_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_drafts_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_network_variants_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_queue_items_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_publish_attempts_id_idx";
  DROP INDEX "payload_locked_documents_rels_external_posts_id_idx";
  DROP INDEX "payload_locked_documents_rels_campaigns_id_idx";
  DROP INDEX "payload_locked_documents_rels_calendar_entry_audits_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_accounts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_drafts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_network_variants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_queue_items_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_publish_attempts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "external_posts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "campaigns_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "calendar_entry_audits_id";
  DROP TYPE "public"."enum_social_accounts_network";
  DROP TYPE "public"."enum_social_accounts_actor_type";
  DROP TYPE "public"."enum_social_accounts_capability_state";
  DROP TYPE "public"."enum_social_accounts_credential_health";
  DROP TYPE "public"."enum_social_drafts_status";
  DROP TYPE "public"."enum_social_network_variants_network";
  DROP TYPE "public"."enum_social_network_variants_status";
  DROP TYPE "public"."enum_social_queue_items_status";
  DROP TYPE "public"."enum_social_publish_attempts_status";
  DROP TYPE "public"."enum_external_posts_remote_state";
  DROP TYPE "public"."enum_campaigns_status";`)
}

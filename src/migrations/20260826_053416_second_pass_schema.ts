import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
    CREATE TYPE "public"."enum_media_assets_rights_status" AS ENUM('pending', 'approved', 'restricted', 'expired');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_content_releases_status" AS ENUM('draft', 'scheduled', 'released', 'cancelled');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_campaigns_visibility" AS ENUM('public', 'private');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_campaigns_supporter_visibility" AS ENUM('aggregate', 'named-opt-in', 'private');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_definitions_template" AS ENUM('contact', 'newsletter-signup', 'volunteer', 'sponsorship-inquiry', 'advertiser-media-kit', 'donation-interest', 'reader-submission', 'confidential-tip', 'event-rsvp', 'survey', 'poll', 'application', 'waitlist', 'quote-request', 'product-preorder-interest', 'custom');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_definitions_visibility" AS ENUM('public', 'private', 'members');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_definitions_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_definitions_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_schemas_state" AS ENUM('draft', 'published', 'retired');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_schemas_consent_translation_status" AS ENUM('not-required', 'reviewed', 'outdated', 'machine-generated');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_submissions_status" AS ENUM('received', 'challenged', 'held', 'triaged', 'accepted', 'rejected', 'redacted', 'expired');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_submissions_privacy_class" AS ENUM('standard', 'sensitive', 'confidential');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_submissions_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_submissions_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_submission_attachments_scan_status" AS ENUM('pending', 'clean', 'rejected');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_contacts_status" AS ENUM('lead', 'active', 'inactive', 'blocked', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_contacts_merge_state" AS ENUM('clear', 'proposed', 'merged');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_contacts_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_contacts_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_organizations_status" AS ENUM('lead', 'active', 'inactive', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_organizations_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_organizations_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_interaction_records_kind" AS ENUM('form', 'email', 'call', 'meeting', 'note', 'campaign', 'order', 'contribution');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_deals_opportunities_stage" AS ENUM('new', 'qualified', 'proposal', 'creative-approval', 'placement', 'won', 'lost');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_next_actions_status" AS ENUM('open', 'done', 'cancelled');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_workflow_items_type" AS ENUM('campaign-launch', 'sponsor-approval', 'social-package', 'event-production', 'product-launch', 'media-processing', 'moderation', 'outreach', 'form-intake', 'partner-follow-up', 'system-exception', 'custom');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_workflow_items_status" AS ENUM('open', 'in-progress', 'blocked', 'completed', 'cancelled', 'reopened');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_workflow_items_priority" AS ENUM('low', 'normal', 'high', 'urgent');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_audience_lists_status" AS ENUM('active', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_audience_segments_status" AS ENUM('active', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_audience_memberships_status" AS ENUM('pending', 'active', 'unsubscribed', 'suppressed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_subscribers_status" AS ENUM('pending', 'active', 'unsubscribed', 'suppressed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_consent_events_event" AS ENUM('requested', 'double-opt-in-confirmed', 'unsubscribe', 'resubscribe', 'imported', 'bounce', 'complaint');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_suppressions_reason" AS ENUM('unsubscribe', 'bounce', 'complaint', 'provider');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_email_messages_kind" AS ENUM('transactional', 'bulk', 'digest');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_email_messages_status" AS ENUM('draft', 'review', 'scheduled', 'queued', 'sending', 'sent', 'cancelled', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_email_deliveries_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'cancelled', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_notifications_status" AS ENUM('unread', 'read', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_notification_channels_kind" AS ENUM('in-app', 'email', 'push');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_digest_definitions_cadence" AS ENUM('immediate', 'daily', 'weekly', 'custom');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_digest_runs_status" AS ENUM('draft', 'queued', 'sent', 'failed', 'cancelled');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_delivery_receipts_channel" AS ENUM('email', 'push', 'in-app');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_delivery_receipts_status" AS ENUM('queued', 'sent', 'delivered', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_automation_definitions_status" AS ENUM('draft', 'active', 'paused', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_events_consent_basis" AS ENUM('necessary', 'analytics-consent', 'server-trusted', 'denied');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_events_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_events_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_rollups_grain" AS ENUM('daily', 'campaign', 'content', 'channel', 'goal');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_rollups_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_rollups_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_metric_snapshots_grain" AS ENUM('event', 'daily', 'campaign', 'order', 'delivery');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_metric_snapshots_reconciliation_status" AS ENUM('unreconciled', 'reconciled', 'provider-reported', 'estimated');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_metric_snapshots_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_metric_snapshots_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_experience_rules_status" AS ENUM('draft', 'approved', 'active', 'paused', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_experience_variants_status" AS ENUM('draft', 'approved', 'active', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_experiments_state" AS ENUM('draft', 'approved', 'running', 'paused', 'stopped', 'inconclusive', 'winner-selected');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_experiment_events_kind" AS ENUM('exposure', 'conversion');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_experiment_decisions_decision" AS ENUM('pause', 'stop', 'inconclusive', 'winner-selected');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_policies_status" AS ENUM('draft', 'active', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_rules_severity" AS ENUM('informational', 'warning', 'publication_blocking');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_scans_target_type" AS ENUM('document', 'content-release', 'publication', 'space', 'site');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_scans_status" AS ENUM('queued', 'running', 'completed', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_issues_severity" AS ENUM('informational', 'warning', 'publication_blocking');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_issues_status" AS ENUM('open', 'resolved', 'waived', 'uncertain');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_merchant_connections_status" AS ENUM('active', 'disabled', 'degraded');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payment_method_capabilities_family" AS ENUM('card', 'wallet', 'bank-debit', 'bank-transfer', 'open-banking', 'mobile-money', 'cash-voucher', 'buy-now-pay-later', 'crypto', 'external-link');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payment_method_capabilities_flow" AS ENUM('hosted', 'redirect', 'qr', 'asynchronous', 'manual');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payment_method_capabilities_health" AS ENUM('healthy', 'degraded', 'unavailable');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_variants_inventory_policy" AS ENUM('untracked', 'tracked', 'external-hook', 'pod-provider');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_prices_recurring_interval" AS ENUM('month', 'year');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_kind" AS ENUM('physical', 'digital', 'pod-reference', 'subscription', 'membership');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_state" AS ENUM('draft', 'review', 'approved', 'published', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_carts_state" AS ENUM('active', 'converted', 'abandoned', 'expired');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_checkout_sessions_state" AS ENUM('open', 'pending', 'completed', 'failed', 'cancelled', 'abandoned', 'expired');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payment_intents_state" AS ENUM('created', 'requires-action', 'pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'disputed', 'exception');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_orders_state" AS ENUM('pending-payment', 'paid', 'fulfilling', 'fulfilled', 'cancelled', 'failed', 'refunded', 'exception');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_supporters_visibility_preference" AS ENUM('public', 'anonymous', 'private');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  ALTER TYPE "public"."enum_media_usages_purpose" ADD VALUE 'newsletter';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'audience-email-delivery';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'audience-newsletter-dispatch';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'commerce-abandon-checkouts';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'audience-email-delivery';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'audience-newsletter-dispatch';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'commerce-abandon-checkouts';
  -- Content releases existed before the Second Pass. Preserve its rows and add only the new commerce fields.
  ALTER TABLE "content_releases" ADD COLUMN IF NOT EXISTS "product_id" uuid;
  ALTER TABLE "content_releases" ADD COLUMN IF NOT EXISTS "product_revision" varchar;
  CREATE TABLE "form_definitions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"template" "enum_form_definitions_template" DEFAULT 'custom' NOT NULL,
  	"public_path" varchar NOT NULL,
  	"visibility" "enum_form_definitions_visibility" DEFAULT 'public' NOT NULL,
  	"active_schema_id" uuid,
  	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"retention_mode" "enum_form_definitions_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_form_definitions_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "form_schemas" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"form_id" uuid NOT NULL,
  	"version" numeric NOT NULL,
  	"state" "enum_form_schemas_state" DEFAULT 'draft' NOT NULL,
  	"locale" varchar DEFAULT 'en' NOT NULL,
  	"schema" jsonb NOT NULL,
  	"consent_text" varchar,
  	"consent_revision" varchar,
  	"consent_translation_status" "enum_form_schemas_consent_translation_status" DEFAULT 'not-required' NOT NULL,
  	"translation_project" varchar,
  	"locale_completeness" jsonb,
  	"brand_snapshot" jsonb,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "form_submissions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"form_id" uuid NOT NULL,
  	"schema_id" uuid NOT NULL,
  	"status" "enum_form_submissions_status" DEFAULT 'received' NOT NULL,
  	"locale" varchar NOT NULL,
  	"values" jsonb NOT NULL,
  	"consent_snapshot" jsonb,
  	"privacy_class" "enum_form_submissions_privacy_class" DEFAULT 'standard' NOT NULL,
  	"abuse" jsonb,
  	"contact_id" uuid,
  	"organization_id" uuid,
  	"workflow_item_id" uuid,
  	"idempotency_key" varchar,
  	"retention_mode" "enum_form_submissions_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_form_submissions_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "submission_attachments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"submission_id" uuid NOT NULL,
  	"media_id" uuid,
  	"filename" varchar NOT NULL,
  	"content_type" varchar,
  	"size" numeric,
  	"scan_status" "enum_submission_attachments_scan_status" DEFAULT 'pending' NOT NULL,
  	"private" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "contacts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"display_name" varchar NOT NULL,
  	"email" varchar,
  	"email_hash" varchar,
  	"member_id" uuid,
  	"status" "enum_contacts_status" DEFAULT 'lead' NOT NULL,
  	"profile" jsonb,
  	"merge_state" "enum_contacts_merge_state" DEFAULT 'clear',
  	"merged_into_id" uuid,
  	"retention_mode" "enum_contacts_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_contacts_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "organizations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"domain" varchar,
  	"status" "enum_organizations_status" DEFAULT 'lead' NOT NULL,
  	"metadata" jsonb,
  	"retention_mode" "enum_organizations_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_organizations_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "relationship_records" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"contact_id" uuid NOT NULL,
  	"organization_id" uuid,
  	"role" varchar,
  	"related" jsonb,
  	"context" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "contact_tags" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"color" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "contact_taggings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"contact_id" uuid NOT NULL,
  	"tag_id" uuid NOT NULL,
  	"source" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "interaction_records" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"contact_id" uuid,
  	"organization_id" uuid,
  	"kind" "enum_interaction_records_kind" DEFAULT 'form' NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"summary" varchar,
  	"references" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "relationship_notes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"contact_id" uuid,
  	"organization_id" uuid,
  	"body" varchar NOT NULL,
  	"private" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "deals_opportunities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"contact_id" uuid,
  	"organization_id" uuid,
  	"campaign_id" uuid,
  	"title" varchar NOT NULL,
  	"stage" "enum_deals_opportunities_stage" DEFAULT 'new' NOT NULL,
  	"amount" numeric,
  	"currency" varchar DEFAULT 'USD',
  	"owner_assignment_id" uuid,
  	"next_action_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "owner_assignments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"assignee_id" uuid,
  	"subject" jsonb NOT NULL,
  	"assigned_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "next_actions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"due_at" timestamp(3) with time zone,
  	"status" "enum_next_actions_status" DEFAULT 'open' NOT NULL,
  	"subject" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "workflow_items" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"type" "enum_workflow_items_type" DEFAULT 'custom' NOT NULL,
  	"status" "enum_workflow_items_status" DEFAULT 'open' NOT NULL,
  	"priority" "enum_workflow_items_priority" DEFAULT 'normal' NOT NULL,
  	"assignee_id" uuid,
  	"starts_at" timestamp(3) with time zone,
  	"due_at" timestamp(3) with time zone,
  	"checklist" jsonb DEFAULT '[]'::jsonb,
  	"comments" jsonb DEFAULT '[]'::jsonb,
  	"source_references" jsonb,
  	"outcome" jsonb,
  	"audit" jsonb DEFAULT '[]'::jsonb,
  	"calendar_entry_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "workflow_items_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" uuid,
  	"media_assets_id" uuid,
  	"workflow_items_id" uuid
  );
  
  CREATE TABLE "audience_lists" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"status" "enum_audience_lists_status" DEFAULT 'active' NOT NULL,
  	"double_opt_in" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audience_segments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"definition" jsonb NOT NULL,
  	"consent_basis_required" boolean DEFAULT true,
  	"status" "enum_audience_segments_status" DEFAULT 'active' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audience_memberships" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"subscriber_id" uuid NOT NULL,
  	"audience_list_id" uuid NOT NULL,
  	"status" "enum_audience_memberships_status" DEFAULT 'pending' NOT NULL,
  	"confirmed_at" timestamp(3) with time zone,
  	"source" varchar DEFAULT 'form' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "subscriber_confirmation_tokens" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"subscriber_id" uuid NOT NULL,
  	"audience_list_id" uuid,
  	"token_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"used_at" timestamp(3) with time zone,
  	"locale" varchar NOT NULL,
  	"consent_wording" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "subscribers" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"email" varchar NOT NULL,
  	"email_hash" varchar NOT NULL,
  	"member_id" uuid,
  	"contact_id" uuid,
  	"status" "enum_subscribers_status" DEFAULT 'pending' NOT NULL,
  	"verified_at" timestamp(3) with time zone,
  	"global_unsubscribed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "consent_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"subscriber_id" uuid,
  	"contact_id" uuid,
  	"form_submission_id" uuid,
  	"audience_list_id" uuid,
  	"event" "enum_consent_events_event" DEFAULT 'requested' NOT NULL,
  	"basis" varchar NOT NULL,
  	"wording" varchar,
  	"locale" varchar,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"evidence" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "preferences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"subscriber_id" uuid NOT NULL,
  	"audience_list_id" uuid,
  	"preferences" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "suppressions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"email_hash" varchar NOT NULL,
  	"reason" "enum_suppressions_reason" DEFAULT 'unsubscribe' NOT NULL,
  	"provider" varchar,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"global" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_messages" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"subject" varchar NOT NULL,
  	"blocks" jsonb NOT NULL,
  	"kind" "enum_email_messages_kind" NOT NULL,
  	"status" "enum_email_messages_status" DEFAULT 'draft' NOT NULL,
  	"scheduled_for" timestamp(3) with time zone,
  	"idempotency_key" varchar,
  	"tracking" jsonb,
  	"audience" jsonb,
  	"reviewed_at" timestamp(3) with time zone,
  	"cancel_cutoff_at" timestamp(3) with time zone,
  	"translation_project" varchar,
  	"locale_completeness" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "delivery_identities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"email_hash" varchar NOT NULL,
  	"provider" varchar NOT NULL,
  	"provider_recipient_id" varchar,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_deliveries" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"message_id" uuid NOT NULL,
  	"subscriber_id" uuid,
  	"recipient_email" varchar NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"status" "enum_email_deliveries_status" DEFAULT 'queued' NOT NULL,
  	"provider" varchar,
  	"provider_message_id" varchar,
  	"attempts" numeric DEFAULT 0,
  	"outcome" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "activity_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"type" varchar NOT NULL,
  	"actor" jsonb,
  	"object" jsonb,
  	"payload" jsonb,
  	"visibility_snapshot" jsonb,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notifications" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"activity_event_id" uuid NOT NULL,
  	"recipient_member_id" uuid NOT NULL,
  	"status" "enum_notifications_status" DEFAULT 'unread' NOT NULL,
  	"channels" jsonb NOT NULL,
  	"read_at" timestamp(3) with time zone,
  	"muted_until" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notification_preferences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"rules" jsonb NOT NULL,
  	"quiet_hours" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notification_channels" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"kind" "enum_notification_channels_kind" DEFAULT 'in-app' NOT NULL,
  	"address" varchar,
  	"enabled" boolean DEFAULT true,
  	"verified_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "digest_definitions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"member_id" uuid,
  	"name" varchar NOT NULL,
  	"filters" jsonb NOT NULL,
  	"cadence" "enum_digest_definitions_cadence" DEFAULT 'weekly' NOT NULL,
  	"channels" jsonb NOT NULL,
  	"template" jsonb,
  	"review_required" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "digest_runs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"definition_id" uuid NOT NULL,
  	"source_event_ids" jsonb NOT NULL,
  	"frozen_at" timestamp(3) with time zone NOT NULL,
  	"status" "enum_digest_runs_status" DEFAULT 'draft' NOT NULL,
  	"outcome" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "delivery_receipts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"delivery_id" uuid,
  	"notification_id" uuid,
  	"channel" "enum_delivery_receipts_channel" DEFAULT 'in-app' NOT NULL,
  	"status" "enum_delivery_receipts_status" DEFAULT 'queued' NOT NULL,
  	"provider_event" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "automation_definitions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"status" "enum_automation_definitions_status" DEFAULT 'draft' NOT NULL,
  	"trigger" jsonb NOT NULL,
  	"conditions" jsonb DEFAULT '[]'::jsonb,
  	"actions" jsonb NOT NULL,
  	"requires_approval" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "analytics_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"event_id" varchar NOT NULL,
  	"dedupe_key" varchar NOT NULL,
  	"event_type" varchar NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"schema_version" numeric DEFAULT 1 NOT NULL,
  	"consent_basis" "enum_analytics_events_consent_basis" NOT NULL,
  	"anonymous_hash" varchar,
  	"session_hash" varchar,
  	"member_id" uuid,
  	"context" jsonb NOT NULL,
  	"properties" jsonb,
  	"trusted" boolean DEFAULT false,
  	"retention_mode" "enum_analytics_events_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_analytics_events_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "analytics_rollups" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"metric" varchar NOT NULL,
  	"definition" varchar NOT NULL,
  	"grain" "enum_analytics_rollups_grain" NOT NULL,
  	"window_start" timestamp(3) with time zone NOT NULL,
  	"window_end" timestamp(3) with time zone NOT NULL,
  	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"value" varchar NOT NULL,
  	"unique_count_method" varchar,
  	"schema_version" numeric DEFAULT 1 NOT NULL,
  	"late_events_included_until" timestamp(3) with time zone,
  	"retention_mode" "enum_analytics_rollups_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_analytics_rollups_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "metric_snapshots" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"metric" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"definition" varchar NOT NULL,
  	"provider" varchar,
  	"grain" "enum_metric_snapshots_grain" NOT NULL,
  	"window_start" timestamp(3) with time zone NOT NULL,
  	"window_end" timestamp(3) with time zone NOT NULL,
  	"financial" jsonb,
  	"reconciliation_status" "enum_metric_snapshots_reconciliation_status" NOT NULL,
  	"source_reference" varchar,
  	"retention_mode" "enum_metric_snapshots_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_metric_snapshots_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "analytics_goals" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"event_types" jsonb NOT NULL,
  	"definition" varchar NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "command_center_preferences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" uuid NOT NULL,
  	"hidden_sections" jsonb DEFAULT '[]'::jsonb,
  	"section_order" jsonb DEFAULT '[]'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experience_rules" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"status" "enum_experience_rules_status" DEFAULT 'draft' NOT NULL,
  	"approved_by_id" uuid,
  	"approved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experience_variants" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"rule_id" uuid NOT NULL,
  	"name" varchar NOT NULL,
  	"registered_component" varchar NOT NULL,
  	"content_revision_id" uuid,
  	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"status" "enum_experience_variants_status" DEFAULT 'draft' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"rule_id" uuid,
  	"conversion_goal_id" uuid,
  	"state" "enum_experiments_state" DEFAULT 'draft' NOT NULL,
  	"assignment_salt" varchar NOT NULL,
  	"collection_enabled" boolean DEFAULT true,
  	"approved_by_id" uuid,
  	"approved_at" timestamp(3) with time zone,
  	"started_at" timestamp(3) with time zone,
  	"stopped_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiment_variants" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"experience_variant_id" uuid,
  	"name" varchar NOT NULL,
  	"is_control" boolean DEFAULT false,
  	"allocation" numeric NOT NULL,
  	"registered_component" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "traffic_allocations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"allocation" numeric NOT NULL,
  	"effective_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiment_assignments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"subject_key" varchar NOT NULL,
  	"dedupe_key" varchar NOT NULL,
  	"consent_basis" varchar NOT NULL,
  	"assigned_at" timestamp(3) with time zone NOT NULL,
  	"is_default" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "conversion_goals" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"event_types" jsonb NOT NULL,
  	"definition" varchar NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiment_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"assignment_id" uuid,
  	"kind" "enum_experiment_events_kind" DEFAULT 'exposure' NOT NULL,
  	"goal_key" varchar,
  	"dedupe_key" varchar NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"consent_basis" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiment_analyses" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"computed_at" timestamp(3) with time zone NOT NULL,
  	"result" jsonb NOT NULL,
  	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiment_decisions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"selected_variant_id" uuid,
  	"decision" "enum_experiment_decisions_decision" DEFAULT 'inconclusive' NOT NULL,
  	"reason" varchar NOT NULL,
  	"actor_id" uuid NOT NULL,
  	"decided_at" timestamp(3) with time zone NOT NULL,
  	"approval_required" boolean DEFAULT true,
  	"approved_by_id" uuid,
  	"approved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_policies" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"status" "enum_quality_policies_status" DEFAULT 'draft' NOT NULL,
  	"release_checks_required" boolean DEFAULT true,
  	"rules" jsonb DEFAULT '[]'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_rules" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"policy_id" uuid,
  	"key" varchar NOT NULL,
  	"producer" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"severity" "enum_quality_rules_severity" DEFAULT 'warning' NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"configuration" jsonb DEFAULT '{}'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_scans" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"policy_id" uuid,
  	"target_type" "enum_quality_scans_target_type" DEFAULT 'document' NOT NULL,
  	"target_id" varchar NOT NULL,
  	"revision_id" varchar,
  	"status" "enum_quality_scans_status" DEFAULT 'queued' NOT NULL,
  	"started_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"summary" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_issues" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"scan_id" uuid,
  	"rule_id" uuid,
  	"dedupe_key" varchar NOT NULL,
  	"revision_id" varchar,
  	"target_type" varchar NOT NULL,
  	"target_id" varchar NOT NULL,
  	"surface" varchar,
  	"severity" "enum_quality_issues_severity" DEFAULT 'warning' NOT NULL,
  	"status" "enum_quality_issues_status" DEFAULT 'open' NOT NULL,
  	"message" varchar NOT NULL,
  	"remediation" jsonb,
  	"owner_id" uuid,
  	"first_seen_at" timestamp(3) with time zone NOT NULL,
  	"resolved_at" timestamp(3) with time zone,
  	"dependency_fingerprint" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_exceptions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"rule_id" uuid NOT NULL,
  	"target_type" varchar NOT NULL,
  	"target_id" varchar NOT NULL,
  	"reason" varchar NOT NULL,
  	"actor_id" uuid NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_waivers" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"issue_id" uuid NOT NULL,
  	"reason" varchar NOT NULL,
  	"actor_id" uuid NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"authorized_by_id" uuid NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_reports" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"scan_id" uuid NOT NULL,
  	"report" jsonb NOT NULL,
  	"generated_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "merchant_connections" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"label" varchar NOT NULL,
  	"provider_key" varchar NOT NULL,
  	"merchant_country" varchar NOT NULL,
  	"status" "enum_merchant_connections_status" DEFAULT 'active' NOT NULL,
  	"credential_reference" varchar,
  	"configuration" jsonb DEFAULT '{}'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_method_capabilities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"merchant_connection_id" uuid NOT NULL,
  	"provider_key" varchar NOT NULL,
  	"rail_key" varchar NOT NULL,
  	"family" "enum_payment_method_capabilities_family" NOT NULL,
  	"flow" "enum_payment_method_capabilities_flow" NOT NULL,
  	"merchant_countries" jsonb DEFAULT '[]'::jsonb,
  	"buyer_countries" jsonb DEFAULT '[]'::jsonb,
  	"presentment_currencies" jsonb DEFAULT '[]'::jsonb,
  	"settlement_currencies" jsonb DEFAULT '[]'::jsonb,
  	"minimum_amount_minor" varchar,
  	"maximum_amount_minor" varchar,
  	"recurring" boolean DEFAULT false,
  	"refunds" boolean DEFAULT false,
  	"enabled" boolean DEFAULT true,
  	"health" "enum_payment_method_capabilities_health" DEFAULT 'healthy' NOT NULL,
  	"required_customer_fields" jsonb DEFAULT '[]'::jsonb,
  	"instructions" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "products_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sku" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"attributes" jsonb DEFAULT '{}'::jsonb,
  	"inventory_policy" "enum_products_variants_inventory_policy" DEFAULT 'untracked',
  	"inventory_quantity" numeric,
  	"inventory_reference" varchar,
  	"pod_reference" jsonb
  );
  
  CREATE TABLE "products_prices" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"currency" varchar NOT NULL,
  	"amount_minor" varchar NOT NULL,
  	"compare_at_minor" varchar,
  	"variant_sku" varchar,
  	"recurring_interval" "enum_products_prices_recurring_interval"
  );
  
  CREATE TABLE "products" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"merchant_connection_id" uuid NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"canonical_path" varchar NOT NULL,
  	"kind" "enum_products_kind" NOT NULL,
  	"state" "enum_products_state" DEFAULT 'draft' NOT NULL,
  	"description" varchar,
  	"localized" jsonb DEFAULT '{}'::jsonb,
  	"categories_id" uuid,
  	"entitlement" varchar,
  	"release_revision" varchar,
  	"retention_mode" "enum_products_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_products_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "products_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"albums_id" uuid,
  	"media_assets_id" uuid
  );
  
  CREATE TABLE "carts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"merchant_connection_id" uuid NOT NULL,
  	"currency" varchar NOT NULL,
  	"buyer_country" varchar,
  	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"state" "enum_carts_state" DEFAULT 'active' NOT NULL,
  	"idempotency_key" varchar,
  	"expires_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "checkout_sessions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"cart_id" uuid NOT NULL,
  	"merchant_connection_id" uuid NOT NULL,
  	"currency" varchar NOT NULL,
  	"amount_minor" varchar NOT NULL,
  	"buyer_country" varchar,
  	"state" "enum_checkout_sessions_state" DEFAULT 'open' NOT NULL,
  	"selected_capability_id" varchar,
  	"legal_copy" jsonb DEFAULT '{}'::jsonb,
  	"idempotency_key" varchar,
  	"expires_at" timestamp(3) with time zone,
  	"shipping_extension" jsonb,
  	"tax_extension" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_intents" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"checkout_session_id" uuid NOT NULL,
  	"merchant_connection_id" uuid NOT NULL,
  	"capability_id" varchar NOT NULL,
  	"provider_key" varchar NOT NULL,
  	"amount_minor" varchar NOT NULL,
  	"currency" varchar NOT NULL,
  	"state" "enum_payment_intents_state" DEFAULT 'created' NOT NULL,
  	"provider_reference" varchar,
  	"crypto_invoice" jsonb,
  	"exception" jsonb,
  	"financial_events" jsonb DEFAULT '[]'::jsonb,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "orders" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"checkout_session_id" uuid NOT NULL,
  	"merchant_connection_id" uuid NOT NULL,
  	"order_number" varchar NOT NULL,
  	"state" "enum_orders_state" NOT NULL,
  	"currency" varchar NOT NULL,
  	"amount_minor" varchar NOT NULL,
  	"items" jsonb NOT NULL,
  	"transition_log" jsonb DEFAULT '[]'::jsonb,
  	"refund_extension" jsonb,
  	"receipt" jsonb,
  	"fulfillment_extension" jsonb,
  	"exception" jsonb,
  	"pos_metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_webhook_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"merchant_connection_id" uuid NOT NULL,
  	"provider_key" varchar NOT NULL,
  	"provider_event_id" varchar NOT NULL,
  	"payload_hash" varchar NOT NULL,
  	"verified_at" timestamp(3) with time zone NOT NULL,
  	"processed_at" timestamp(3) with time zone,
  	"outcome" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "supporters" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"display_name" varchar,
  	"member_id" uuid,
  	"email_hash" varchar,
  	"provider_references" jsonb DEFAULT '[]'::jsonb,
  	"visibility_preference" "enum_supporters_visibility_preference" DEFAULT 'public',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "entitlements" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"supporter_id" uuid NOT NULL,
  	"campaign_id" uuid,
  	"payment_intent_id" uuid,
  	"entitlement" varchar NOT NULL,
  	"source" varchar NOT NULL,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"ends_at" timestamp(3) with time zone,
  	"revoked_at" timestamp(3) with time zone,
  	"fulfillment_reference" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "rights_status" "enum_media_assets_rights_status" DEFAULT 'approved';
  ALTER TABLE "media_usages_rels" ADD COLUMN "email_messages_id" uuid;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "site_id" uuid NOT NULL;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "publication_id" uuid;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "space_id" uuid;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "template" varchar;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "layout_variant" varchar;
  ALTER TABLE "campaigns" ADD COLUMN "visibility" "enum_campaigns_visibility" DEFAULT 'public' NOT NULL;
  ALTER TABLE "campaigns" ADD COLUMN "start_at" timestamp(3) with time zone;
  ALTER TABLE "campaigns" ADD COLUMN "end_at" timestamp(3) with time zone;
  ALTER TABLE "campaigns" ADD COLUMN "goal" jsonb;
  ALTER TABLE "campaigns" ADD COLUMN "milestones" jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE "campaigns" ADD COLUMN "updates" jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE "campaigns" ADD COLUMN "tiers" jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE "campaigns" ADD COLUMN "progress" jsonb DEFAULT '{"raisedMinor":"0","supporterCount":0,"history":[]}'::jsonb;
  ALTER TABLE "campaigns" ADD COLUMN "calendar_entry_id" uuid;
  ALTER TABLE "campaigns" ADD COLUMN "supporter_visibility" "enum_campaigns_supporter_visibility" DEFAULT 'aggregate';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_releases_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_definitions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_schemas_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_submissions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "submission_attachments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "contacts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organizations_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "relationship_records_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "contact_tags_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "contact_taggings_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "interaction_records_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "relationship_notes_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "deals_opportunities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "owner_assignments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "next_actions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "workflow_items_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audience_lists_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audience_segments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audience_memberships_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subscriber_confirmation_tokens_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subscribers_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "consent_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "preferences_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "suppressions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_messages_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "delivery_identities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_deliveries_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "activity_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notifications_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notification_preferences_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notification_channels_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "digest_definitions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "digest_runs_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "delivery_receipts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "automation_definitions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "analytics_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "analytics_rollups_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "metric_snapshots_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "analytics_goals_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "command_center_preferences_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experience_rules_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experience_variants_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiment_variants_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "traffic_allocations_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiment_assignments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "conversion_goals_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiment_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiment_analyses_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiment_decisions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_policies_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_rules_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_scans_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_issues_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_exceptions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_waivers_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_reports_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "merchant_connections_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_method_capabilities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "products_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "carts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "checkout_sessions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_intents_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "orders_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_webhook_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "supporters_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "entitlements_id" uuid;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_article_id_article_family_content_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article_family_content"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_active_schema_id_form_schemas_id_fk" FOREIGN KEY ("active_schema_id") REFERENCES "public"."form_schemas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_schemas" ADD CONSTRAINT "form_schemas_form_id_form_definitions_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_definitions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_form_definitions_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_definitions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_schema_id_form_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."form_schemas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_workflow_item_id_workflow_items_id_fk" FOREIGN KEY ("workflow_item_id") REFERENCES "public"."workflow_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_submission_id_form_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_merged_into_id_contacts_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_taggings" ADD CONSTRAINT "contact_taggings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_taggings" ADD CONSTRAINT "contact_taggings_tag_id_contact_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."contact_tags"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_owner_assignment_id_owner_assignments_id_fk" FOREIGN KEY ("owner_assignment_id") REFERENCES "public"."owner_assignments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_next_action_id_next_actions_id_fk" FOREIGN KEY ("next_action_id") REFERENCES "public"."next_actions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_calendar_entry_id_calendar_entries_id_fk" FOREIGN KEY ("calendar_entry_id") REFERENCES "public"."calendar_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items_rels" ADD CONSTRAINT "workflow_items_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."workflow_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "workflow_items_rels" ADD CONSTRAINT "workflow_items_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "workflow_items_rels" ADD CONSTRAINT "workflow_items_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "workflow_items_rels" ADD CONSTRAINT "workflow_items_rels_workflow_items_fk" FOREIGN KEY ("workflow_items_id") REFERENCES "public"."workflow_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "audience_lists" ADD CONSTRAINT "audience_lists_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_lists" ADD CONSTRAINT "audience_lists_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_lists" ADD CONSTRAINT "audience_lists_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_lists" ADD CONSTRAINT "audience_lists_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_memberships" ADD CONSTRAINT "audience_memberships_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_memberships" ADD CONSTRAINT "audience_memberships_audience_list_id_audience_lists_id_fk" FOREIGN KEY ("audience_list_id") REFERENCES "public"."audience_lists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscriber_confirmation_tokens" ADD CONSTRAINT "subscriber_confirmation_tokens_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscriber_confirmation_tokens" ADD CONSTRAINT "subscriber_confirmation_tokens_audience_list_id_audience_lists_id_fk" FOREIGN KEY ("audience_list_id") REFERENCES "public"."audience_lists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_form_submission_id_form_submissions_id_fk" FOREIGN KEY ("form_submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_audience_list_id_audience_lists_id_fk" FOREIGN KEY ("audience_list_id") REFERENCES "public"."audience_lists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "preferences" ADD CONSTRAINT "preferences_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "preferences" ADD CONSTRAINT "preferences_audience_list_id_audience_lists_id_fk" FOREIGN KEY ("audience_list_id") REFERENCES "public"."audience_lists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_identities" ADD CONSTRAINT "delivery_identities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_identities" ADD CONSTRAINT "delivery_identities_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_identities" ADD CONSTRAINT "delivery_identities_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_identities" ADD CONSTRAINT "delivery_identities_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_activity_event_id_activity_events_id_fk" FOREIGN KEY ("activity_event_id") REFERENCES "public"."activity_events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_member_id_members_id_fk" FOREIGN KEY ("recipient_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_definitions" ADD CONSTRAINT "digest_definitions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_definitions" ADD CONSTRAINT "digest_definitions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_definitions" ADD CONSTRAINT "digest_definitions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_definitions" ADD CONSTRAINT "digest_definitions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_definitions" ADD CONSTRAINT "digest_definitions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_runs" ADD CONSTRAINT "digest_runs_definition_id_digest_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."digest_definitions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_delivery_id_email_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."email_deliveries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "automation_definitions" ADD CONSTRAINT "automation_definitions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "automation_definitions" ADD CONSTRAINT "automation_definitions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "automation_definitions" ADD CONSTRAINT "automation_definitions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "automation_definitions" ADD CONSTRAINT "automation_definitions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_rollups" ADD CONSTRAINT "analytics_rollups_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_rollups" ADD CONSTRAINT "analytics_rollups_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_rollups" ADD CONSTRAINT "analytics_rollups_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_rollups" ADD CONSTRAINT "analytics_rollups_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "command_center_preferences" ADD CONSTRAINT "command_center_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_rules" ADD CONSTRAINT "experience_rules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_rules" ADD CONSTRAINT "experience_rules_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_rules" ADD CONSTRAINT "experience_rules_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_rules" ADD CONSTRAINT "experience_rules_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_rules" ADD CONSTRAINT "experience_rules_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_rule_id_experience_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."experience_rules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_content_revision_id_revision_records_id_fk" FOREIGN KEY ("content_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_rule_id_experience_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."experience_rules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_conversion_goal_id_conversion_goals_id_fk" FOREIGN KEY ("conversion_goal_id") REFERENCES "public"."conversion_goals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experience_variant_id_experience_variants_id_fk" FOREIGN KEY ("experience_variant_id") REFERENCES "public"."experience_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversion_goals" ADD CONSTRAINT "conversion_goals_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversion_goals" ADD CONSTRAINT "conversion_goals_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversion_goals" ADD CONSTRAINT "conversion_goals_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversion_goals" ADD CONSTRAINT "conversion_goals_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_assignment_id_experiment_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."experiment_assignments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_selected_variant_id_experiment_variants_id_fk" FOREIGN KEY ("selected_variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_policies" ADD CONSTRAINT "quality_policies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_policies" ADD CONSTRAINT "quality_policies_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_policies" ADD CONSTRAINT "quality_policies_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_policies" ADD CONSTRAINT "quality_policies_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_rules" ADD CONSTRAINT "quality_rules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_rules" ADD CONSTRAINT "quality_rules_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_rules" ADD CONSTRAINT "quality_rules_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_rules" ADD CONSTRAINT "quality_rules_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_rules" ADD CONSTRAINT "quality_rules_policy_id_quality_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."quality_policies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_policy_id_quality_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."quality_policies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_scan_id_quality_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."quality_scans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_rule_id_quality_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."quality_rules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_rule_id_quality_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."quality_rules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_issue_id_quality_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."quality_issues"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_authorized_by_id_users_id_fk" FOREIGN KEY ("authorized_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_scan_id_quality_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."quality_scans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "merchant_connections" ADD CONSTRAINT "merchant_connections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "merchant_connections" ADD CONSTRAINT "merchant_connections_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "merchant_connections" ADD CONSTRAINT "merchant_connections_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "merchant_connections" ADD CONSTRAINT "merchant_connections_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_method_capabilities" ADD CONSTRAINT "payment_method_capabilities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_method_capabilities" ADD CONSTRAINT "payment_method_capabilities_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_method_capabilities" ADD CONSTRAINT "payment_method_capabilities_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_method_capabilities" ADD CONSTRAINT "payment_method_capabilities_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_method_capabilities" ADD CONSTRAINT "payment_method_capabilities_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_variants" ADD CONSTRAINT "products_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_prices" ADD CONSTRAINT "products_prices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_categories_id_categories_id_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supporters" ADD CONSTRAINT "supporters_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supporters" ADD CONSTRAINT "supporters_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supporters" ADD CONSTRAINT "supporters_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supporters" ADD CONSTRAINT "supporters_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supporters" ADD CONSTRAINT "supporters_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_supporter_id_supporters_id_fk" FOREIGN KEY ("supporter_id") REFERENCES "public"."supporters"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "content_releases_site_idx" ON "content_releases" USING btree ("site_id");
  CREATE INDEX "content_releases_publication_idx" ON "content_releases" USING btree ("publication_id");
  CREATE INDEX "content_releases_space_idx" ON "content_releases" USING btree ("space_id");
  CREATE INDEX "content_releases_owner_idx" ON "content_releases" USING btree ("owner_id");
  CREATE INDEX "content_releases_content_idx" ON "content_releases" USING btree ("content_id");
  CREATE INDEX "content_releases_article_idx" ON "content_releases" USING btree ("article_id");
  CREATE INDEX "content_releases_product_idx" ON "content_releases" USING btree ("product_id");
  CREATE INDEX IF NOT EXISTS "content_releases_scheduled_for_idx" ON "content_releases" USING btree ("scheduled_for");
  CREATE INDEX "content_releases_updated_at_idx" ON "content_releases" USING btree ("updated_at");
  CREATE INDEX "content_releases_created_at_idx" ON "content_releases" USING btree ("created_at");
  CREATE INDEX "form_definitions_site_idx" ON "form_definitions" USING btree ("site_id");
  CREATE INDEX "form_definitions_publication_idx" ON "form_definitions" USING btree ("publication_id");
  CREATE INDEX "form_definitions_space_idx" ON "form_definitions" USING btree ("space_id");
  CREATE INDEX "form_definitions_owner_idx" ON "form_definitions" USING btree ("owner_id");
  CREATE UNIQUE INDEX "form_definitions_public_path_idx" ON "form_definitions" USING btree ("public_path");
  CREATE INDEX "form_definitions_active_schema_idx" ON "form_definitions" USING btree ("active_schema_id");
  CREATE INDEX "form_definitions_updated_at_idx" ON "form_definitions" USING btree ("updated_at");
  CREATE INDEX "form_definitions_created_at_idx" ON "form_definitions" USING btree ("created_at");
  CREATE INDEX "form_schemas_form_idx" ON "form_schemas" USING btree ("form_id");
  CREATE INDEX "form_schemas_updated_at_idx" ON "form_schemas" USING btree ("updated_at");
  CREATE INDEX "form_schemas_created_at_idx" ON "form_schemas" USING btree ("created_at");
  CREATE UNIQUE INDEX "form_version_idx" ON "form_schemas" USING btree ("form_id","version");
  CREATE INDEX "form_submissions_site_idx" ON "form_submissions" USING btree ("site_id");
  CREATE INDEX "form_submissions_publication_idx" ON "form_submissions" USING btree ("publication_id");
  CREATE INDEX "form_submissions_space_idx" ON "form_submissions" USING btree ("space_id");
  CREATE INDEX "form_submissions_owner_idx" ON "form_submissions" USING btree ("owner_id");
  CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id");
  CREATE INDEX "form_submissions_schema_idx" ON "form_submissions" USING btree ("schema_id");
  CREATE INDEX "form_submissions_contact_idx" ON "form_submissions" USING btree ("contact_id");
  CREATE INDEX "form_submissions_organization_idx" ON "form_submissions" USING btree ("organization_id");
  CREATE INDEX "form_submissions_workflow_item_idx" ON "form_submissions" USING btree ("workflow_item_id");
  CREATE INDEX "form_submissions_idempotency_key_idx" ON "form_submissions" USING btree ("idempotency_key");
  CREATE INDEX "form_submissions_updated_at_idx" ON "form_submissions" USING btree ("updated_at");
  CREATE INDEX "form_submissions_created_at_idx" ON "form_submissions" USING btree ("created_at");
  CREATE INDEX "submission_attachments_submission_idx" ON "submission_attachments" USING btree ("submission_id");
  CREATE INDEX "submission_attachments_media_idx" ON "submission_attachments" USING btree ("media_id");
  CREATE INDEX "submission_attachments_updated_at_idx" ON "submission_attachments" USING btree ("updated_at");
  CREATE INDEX "submission_attachments_created_at_idx" ON "submission_attachments" USING btree ("created_at");
  CREATE INDEX "contacts_site_idx" ON "contacts" USING btree ("site_id");
  CREATE INDEX "contacts_publication_idx" ON "contacts" USING btree ("publication_id");
  CREATE INDEX "contacts_space_idx" ON "contacts" USING btree ("space_id");
  CREATE INDEX "contacts_owner_idx" ON "contacts" USING btree ("owner_id");
  CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");
  CREATE INDEX "contacts_email_hash_idx" ON "contacts" USING btree ("email_hash");
  CREATE INDEX "contacts_member_idx" ON "contacts" USING btree ("member_id");
  CREATE INDEX "contacts_merged_into_idx" ON "contacts" USING btree ("merged_into_id");
  CREATE INDEX "contacts_updated_at_idx" ON "contacts" USING btree ("updated_at");
  CREATE INDEX "contacts_created_at_idx" ON "contacts" USING btree ("created_at");
  CREATE INDEX "organizations_site_idx" ON "organizations" USING btree ("site_id");
  CREATE INDEX "organizations_publication_idx" ON "organizations" USING btree ("publication_id");
  CREATE INDEX "organizations_space_idx" ON "organizations" USING btree ("space_id");
  CREATE INDEX "organizations_owner_idx" ON "organizations" USING btree ("owner_id");
  CREATE INDEX "organizations_domain_idx" ON "organizations" USING btree ("domain");
  CREATE INDEX "organizations_updated_at_idx" ON "organizations" USING btree ("updated_at");
  CREATE INDEX "organizations_created_at_idx" ON "organizations" USING btree ("created_at");
  CREATE INDEX "relationship_records_site_idx" ON "relationship_records" USING btree ("site_id");
  CREATE INDEX "relationship_records_publication_idx" ON "relationship_records" USING btree ("publication_id");
  CREATE INDEX "relationship_records_space_idx" ON "relationship_records" USING btree ("space_id");
  CREATE INDEX "relationship_records_owner_idx" ON "relationship_records" USING btree ("owner_id");
  CREATE INDEX "relationship_records_contact_idx" ON "relationship_records" USING btree ("contact_id");
  CREATE INDEX "relationship_records_organization_idx" ON "relationship_records" USING btree ("organization_id");
  CREATE INDEX "relationship_records_updated_at_idx" ON "relationship_records" USING btree ("updated_at");
  CREATE INDEX "relationship_records_created_at_idx" ON "relationship_records" USING btree ("created_at");
  CREATE INDEX "contact_tags_site_idx" ON "contact_tags" USING btree ("site_id");
  CREATE INDEX "contact_tags_publication_idx" ON "contact_tags" USING btree ("publication_id");
  CREATE INDEX "contact_tags_space_idx" ON "contact_tags" USING btree ("space_id");
  CREATE INDEX "contact_tags_owner_idx" ON "contact_tags" USING btree ("owner_id");
  CREATE INDEX "contact_tags_updated_at_idx" ON "contact_tags" USING btree ("updated_at");
  CREATE INDEX "contact_tags_created_at_idx" ON "contact_tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_name_idx" ON "contact_tags" USING btree ("site_id","name");
  CREATE INDEX "contact_taggings_contact_idx" ON "contact_taggings" USING btree ("contact_id");
  CREATE INDEX "contact_taggings_tag_idx" ON "contact_taggings" USING btree ("tag_id");
  CREATE INDEX "contact_taggings_updated_at_idx" ON "contact_taggings" USING btree ("updated_at");
  CREATE INDEX "contact_taggings_created_at_idx" ON "contact_taggings" USING btree ("created_at");
  CREATE UNIQUE INDEX "contact_tag_idx" ON "contact_taggings" USING btree ("contact_id","tag_id");
  CREATE INDEX "interaction_records_site_idx" ON "interaction_records" USING btree ("site_id");
  CREATE INDEX "interaction_records_publication_idx" ON "interaction_records" USING btree ("publication_id");
  CREATE INDEX "interaction_records_space_idx" ON "interaction_records" USING btree ("space_id");
  CREATE INDEX "interaction_records_owner_idx" ON "interaction_records" USING btree ("owner_id");
  CREATE INDEX "interaction_records_contact_idx" ON "interaction_records" USING btree ("contact_id");
  CREATE INDEX "interaction_records_organization_idx" ON "interaction_records" USING btree ("organization_id");
  CREATE INDEX "interaction_records_updated_at_idx" ON "interaction_records" USING btree ("updated_at");
  CREATE INDEX "interaction_records_created_at_idx" ON "interaction_records" USING btree ("created_at");
  CREATE INDEX "relationship_notes_site_idx" ON "relationship_notes" USING btree ("site_id");
  CREATE INDEX "relationship_notes_publication_idx" ON "relationship_notes" USING btree ("publication_id");
  CREATE INDEX "relationship_notes_space_idx" ON "relationship_notes" USING btree ("space_id");
  CREATE INDEX "relationship_notes_owner_idx" ON "relationship_notes" USING btree ("owner_id");
  CREATE INDEX "relationship_notes_contact_idx" ON "relationship_notes" USING btree ("contact_id");
  CREATE INDEX "relationship_notes_organization_idx" ON "relationship_notes" USING btree ("organization_id");
  CREATE INDEX "relationship_notes_updated_at_idx" ON "relationship_notes" USING btree ("updated_at");
  CREATE INDEX "relationship_notes_created_at_idx" ON "relationship_notes" USING btree ("created_at");
  CREATE INDEX "deals_opportunities_site_idx" ON "deals_opportunities" USING btree ("site_id");
  CREATE INDEX "deals_opportunities_publication_idx" ON "deals_opportunities" USING btree ("publication_id");
  CREATE INDEX "deals_opportunities_space_idx" ON "deals_opportunities" USING btree ("space_id");
  CREATE INDEX "deals_opportunities_owner_idx" ON "deals_opportunities" USING btree ("owner_id");
  CREATE INDEX "deals_opportunities_contact_idx" ON "deals_opportunities" USING btree ("contact_id");
  CREATE INDEX "deals_opportunities_organization_idx" ON "deals_opportunities" USING btree ("organization_id");
  CREATE INDEX "deals_opportunities_campaign_idx" ON "deals_opportunities" USING btree ("campaign_id");
  CREATE INDEX "deals_opportunities_owner_assignment_idx" ON "deals_opportunities" USING btree ("owner_assignment_id");
  CREATE INDEX "deals_opportunities_next_action_idx" ON "deals_opportunities" USING btree ("next_action_id");
  CREATE INDEX "deals_opportunities_updated_at_idx" ON "deals_opportunities" USING btree ("updated_at");
  CREATE INDEX "deals_opportunities_created_at_idx" ON "deals_opportunities" USING btree ("created_at");
  CREATE INDEX "owner_assignments_site_idx" ON "owner_assignments" USING btree ("site_id");
  CREATE INDEX "owner_assignments_publication_idx" ON "owner_assignments" USING btree ("publication_id");
  CREATE INDEX "owner_assignments_space_idx" ON "owner_assignments" USING btree ("space_id");
  CREATE INDEX "owner_assignments_owner_idx" ON "owner_assignments" USING btree ("owner_id");
  CREATE INDEX "owner_assignments_assignee_idx" ON "owner_assignments" USING btree ("assignee_id");
  CREATE INDEX "owner_assignments_updated_at_idx" ON "owner_assignments" USING btree ("updated_at");
  CREATE INDEX "owner_assignments_created_at_idx" ON "owner_assignments" USING btree ("created_at");
  CREATE INDEX "next_actions_site_idx" ON "next_actions" USING btree ("site_id");
  CREATE INDEX "next_actions_publication_idx" ON "next_actions" USING btree ("publication_id");
  CREATE INDEX "next_actions_space_idx" ON "next_actions" USING btree ("space_id");
  CREATE INDEX "next_actions_owner_idx" ON "next_actions" USING btree ("owner_id");
  CREATE INDEX "next_actions_updated_at_idx" ON "next_actions" USING btree ("updated_at");
  CREATE INDEX "next_actions_created_at_idx" ON "next_actions" USING btree ("created_at");
  CREATE INDEX "workflow_items_site_idx" ON "workflow_items" USING btree ("site_id");
  CREATE INDEX "workflow_items_publication_idx" ON "workflow_items" USING btree ("publication_id");
  CREATE INDEX "workflow_items_space_idx" ON "workflow_items" USING btree ("space_id");
  CREATE INDEX "workflow_items_owner_idx" ON "workflow_items" USING btree ("owner_id");
  CREATE INDEX "workflow_items_assignee_idx" ON "workflow_items" USING btree ("assignee_id");
  CREATE INDEX "workflow_items_calendar_entry_idx" ON "workflow_items" USING btree ("calendar_entry_id");
  CREATE INDEX "workflow_items_updated_at_idx" ON "workflow_items" USING btree ("updated_at");
  CREATE INDEX "workflow_items_created_at_idx" ON "workflow_items" USING btree ("created_at");
  CREATE INDEX "workflow_items_rels_order_idx" ON "workflow_items_rels" USING btree ("order");
  CREATE INDEX "workflow_items_rels_parent_idx" ON "workflow_items_rels" USING btree ("parent_id");
  CREATE INDEX "workflow_items_rels_path_idx" ON "workflow_items_rels" USING btree ("path");
  CREATE INDEX "workflow_items_rels_users_id_idx" ON "workflow_items_rels" USING btree ("users_id");
  CREATE INDEX "workflow_items_rels_media_assets_id_idx" ON "workflow_items_rels" USING btree ("media_assets_id");
  CREATE INDEX "workflow_items_rels_workflow_items_id_idx" ON "workflow_items_rels" USING btree ("workflow_items_id");
  CREATE INDEX "audience_lists_site_idx" ON "audience_lists" USING btree ("site_id");
  CREATE INDEX "audience_lists_publication_idx" ON "audience_lists" USING btree ("publication_id");
  CREATE INDEX "audience_lists_space_idx" ON "audience_lists" USING btree ("space_id");
  CREATE INDEX "audience_lists_owner_idx" ON "audience_lists" USING btree ("owner_id");
  CREATE INDEX "audience_lists_updated_at_idx" ON "audience_lists" USING btree ("updated_at");
  CREATE INDEX "audience_lists_created_at_idx" ON "audience_lists" USING btree ("created_at");
  CREATE INDEX "audience_segments_site_idx" ON "audience_segments" USING btree ("site_id");
  CREATE INDEX "audience_segments_publication_idx" ON "audience_segments" USING btree ("publication_id");
  CREATE INDEX "audience_segments_space_idx" ON "audience_segments" USING btree ("space_id");
  CREATE INDEX "audience_segments_owner_idx" ON "audience_segments" USING btree ("owner_id");
  CREATE INDEX "audience_segments_updated_at_idx" ON "audience_segments" USING btree ("updated_at");
  CREATE INDEX "audience_segments_created_at_idx" ON "audience_segments" USING btree ("created_at");
  CREATE INDEX "audience_memberships_subscriber_idx" ON "audience_memberships" USING btree ("subscriber_id");
  CREATE INDEX "audience_memberships_audience_list_idx" ON "audience_memberships" USING btree ("audience_list_id");
  CREATE INDEX "audience_memberships_updated_at_idx" ON "audience_memberships" USING btree ("updated_at");
  CREATE INDEX "audience_memberships_created_at_idx" ON "audience_memberships" USING btree ("created_at");
  CREATE UNIQUE INDEX "subscriber_audienceList_idx" ON "audience_memberships" USING btree ("subscriber_id","audience_list_id");
  CREATE INDEX "subscriber_confirmation_tokens_subscriber_idx" ON "subscriber_confirmation_tokens" USING btree ("subscriber_id");
  CREATE INDEX "subscriber_confirmation_tokens_audience_list_idx" ON "subscriber_confirmation_tokens" USING btree ("audience_list_id");
  CREATE UNIQUE INDEX "subscriber_confirmation_tokens_token_hash_idx" ON "subscriber_confirmation_tokens" USING btree ("token_hash");
  CREATE INDEX "subscriber_confirmation_tokens_updated_at_idx" ON "subscriber_confirmation_tokens" USING btree ("updated_at");
  CREATE INDEX "subscriber_confirmation_tokens_created_at_idx" ON "subscriber_confirmation_tokens" USING btree ("created_at");
  CREATE INDEX "subscribers_site_idx" ON "subscribers" USING btree ("site_id");
  CREATE INDEX "subscribers_publication_idx" ON "subscribers" USING btree ("publication_id");
  CREATE INDEX "subscribers_space_idx" ON "subscribers" USING btree ("space_id");
  CREATE INDEX "subscribers_owner_idx" ON "subscribers" USING btree ("owner_id");
  CREATE INDEX "subscribers_email_hash_idx" ON "subscribers" USING btree ("email_hash");
  CREATE INDEX "subscribers_member_idx" ON "subscribers" USING btree ("member_id");
  CREATE INDEX "subscribers_contact_idx" ON "subscribers" USING btree ("contact_id");
  CREATE INDEX "subscribers_updated_at_idx" ON "subscribers" USING btree ("updated_at");
  CREATE INDEX "subscribers_created_at_idx" ON "subscribers" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_emailHash_idx" ON "subscribers" USING btree ("site_id","email_hash");
  CREATE INDEX "consent_events_site_idx" ON "consent_events" USING btree ("site_id");
  CREATE INDEX "consent_events_publication_idx" ON "consent_events" USING btree ("publication_id");
  CREATE INDEX "consent_events_space_idx" ON "consent_events" USING btree ("space_id");
  CREATE INDEX "consent_events_owner_idx" ON "consent_events" USING btree ("owner_id");
  CREATE INDEX "consent_events_subscriber_idx" ON "consent_events" USING btree ("subscriber_id");
  CREATE INDEX "consent_events_contact_idx" ON "consent_events" USING btree ("contact_id");
  CREATE INDEX "consent_events_form_submission_idx" ON "consent_events" USING btree ("form_submission_id");
  CREATE INDEX "consent_events_audience_list_idx" ON "consent_events" USING btree ("audience_list_id");
  CREATE INDEX "consent_events_updated_at_idx" ON "consent_events" USING btree ("updated_at");
  CREATE INDEX "consent_events_created_at_idx" ON "consent_events" USING btree ("created_at");
  CREATE INDEX "preferences_subscriber_idx" ON "preferences" USING btree ("subscriber_id");
  CREATE INDEX "preferences_audience_list_idx" ON "preferences" USING btree ("audience_list_id");
  CREATE INDEX "preferences_updated_at_idx" ON "preferences" USING btree ("updated_at");
  CREATE INDEX "preferences_created_at_idx" ON "preferences" USING btree ("created_at");
  CREATE INDEX "suppressions_site_idx" ON "suppressions" USING btree ("site_id");
  CREATE INDEX "suppressions_publication_idx" ON "suppressions" USING btree ("publication_id");
  CREATE INDEX "suppressions_space_idx" ON "suppressions" USING btree ("space_id");
  CREATE INDEX "suppressions_owner_idx" ON "suppressions" USING btree ("owner_id");
  CREATE INDEX "suppressions_email_hash_idx" ON "suppressions" USING btree ("email_hash");
  CREATE INDEX "suppressions_updated_at_idx" ON "suppressions" USING btree ("updated_at");
  CREATE INDEX "suppressions_created_at_idx" ON "suppressions" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_emailHash_reason_idx" ON "suppressions" USING btree ("site_id","email_hash","reason");
  CREATE INDEX "email_messages_site_idx" ON "email_messages" USING btree ("site_id");
  CREATE INDEX "email_messages_publication_idx" ON "email_messages" USING btree ("publication_id");
  CREATE INDEX "email_messages_space_idx" ON "email_messages" USING btree ("space_id");
  CREATE INDEX "email_messages_owner_idx" ON "email_messages" USING btree ("owner_id");
  CREATE UNIQUE INDEX "email_messages_idempotency_key_idx" ON "email_messages" USING btree ("idempotency_key");
  CREATE INDEX "email_messages_updated_at_idx" ON "email_messages" USING btree ("updated_at");
  CREATE INDEX "email_messages_created_at_idx" ON "email_messages" USING btree ("created_at");
  CREATE INDEX "delivery_identities_site_idx" ON "delivery_identities" USING btree ("site_id");
  CREATE INDEX "delivery_identities_publication_idx" ON "delivery_identities" USING btree ("publication_id");
  CREATE INDEX "delivery_identities_space_idx" ON "delivery_identities" USING btree ("space_id");
  CREATE INDEX "delivery_identities_owner_idx" ON "delivery_identities" USING btree ("owner_id");
  CREATE INDEX "delivery_identities_email_hash_idx" ON "delivery_identities" USING btree ("email_hash");
  CREATE INDEX "delivery_identities_updated_at_idx" ON "delivery_identities" USING btree ("updated_at");
  CREATE INDEX "delivery_identities_created_at_idx" ON "delivery_identities" USING btree ("created_at");
  CREATE INDEX "email_deliveries_message_idx" ON "email_deliveries" USING btree ("message_id");
  CREATE INDEX "email_deliveries_subscriber_idx" ON "email_deliveries" USING btree ("subscriber_id");
  CREATE UNIQUE INDEX "email_deliveries_idempotency_key_idx" ON "email_deliveries" USING btree ("idempotency_key");
  CREATE INDEX "email_deliveries_updated_at_idx" ON "email_deliveries" USING btree ("updated_at");
  CREATE INDEX "email_deliveries_created_at_idx" ON "email_deliveries" USING btree ("created_at");
  CREATE INDEX "activity_events_site_idx" ON "activity_events" USING btree ("site_id");
  CREATE INDEX "activity_events_publication_idx" ON "activity_events" USING btree ("publication_id");
  CREATE INDEX "activity_events_space_idx" ON "activity_events" USING btree ("space_id");
  CREATE INDEX "activity_events_owner_idx" ON "activity_events" USING btree ("owner_id");
  CREATE INDEX "activity_events_type_idx" ON "activity_events" USING btree ("type");
  CREATE INDEX "activity_events_updated_at_idx" ON "activity_events" USING btree ("updated_at");
  CREATE INDEX "activity_events_created_at_idx" ON "activity_events" USING btree ("created_at");
  CREATE INDEX "notifications_activity_event_idx" ON "notifications" USING btree ("activity_event_id");
  CREATE INDEX "notifications_recipient_member_idx" ON "notifications" USING btree ("recipient_member_id");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE UNIQUE INDEX "activityEvent_recipientMember_idx" ON "notifications" USING btree ("activity_event_id","recipient_member_id");
  CREATE INDEX "notification_preferences_member_idx" ON "notification_preferences" USING btree ("member_id");
  CREATE INDEX "notification_preferences_updated_at_idx" ON "notification_preferences" USING btree ("updated_at");
  CREATE INDEX "notification_preferences_created_at_idx" ON "notification_preferences" USING btree ("created_at");
  CREATE INDEX "notification_channels_member_idx" ON "notification_channels" USING btree ("member_id");
  CREATE INDEX "notification_channels_updated_at_idx" ON "notification_channels" USING btree ("updated_at");
  CREATE INDEX "notification_channels_created_at_idx" ON "notification_channels" USING btree ("created_at");
  CREATE INDEX "digest_definitions_site_idx" ON "digest_definitions" USING btree ("site_id");
  CREATE INDEX "digest_definitions_publication_idx" ON "digest_definitions" USING btree ("publication_id");
  CREATE INDEX "digest_definitions_space_idx" ON "digest_definitions" USING btree ("space_id");
  CREATE INDEX "digest_definitions_owner_idx" ON "digest_definitions" USING btree ("owner_id");
  CREATE INDEX "digest_definitions_member_idx" ON "digest_definitions" USING btree ("member_id");
  CREATE INDEX "digest_definitions_updated_at_idx" ON "digest_definitions" USING btree ("updated_at");
  CREATE INDEX "digest_definitions_created_at_idx" ON "digest_definitions" USING btree ("created_at");
  CREATE INDEX "digest_runs_definition_idx" ON "digest_runs" USING btree ("definition_id");
  CREATE INDEX "digest_runs_updated_at_idx" ON "digest_runs" USING btree ("updated_at");
  CREATE INDEX "digest_runs_created_at_idx" ON "digest_runs" USING btree ("created_at");
  CREATE INDEX "delivery_receipts_delivery_idx" ON "delivery_receipts" USING btree ("delivery_id");
  CREATE INDEX "delivery_receipts_notification_idx" ON "delivery_receipts" USING btree ("notification_id");
  CREATE INDEX "delivery_receipts_updated_at_idx" ON "delivery_receipts" USING btree ("updated_at");
  CREATE INDEX "delivery_receipts_created_at_idx" ON "delivery_receipts" USING btree ("created_at");
  CREATE INDEX "automation_definitions_site_idx" ON "automation_definitions" USING btree ("site_id");
  CREATE INDEX "automation_definitions_publication_idx" ON "automation_definitions" USING btree ("publication_id");
  CREATE INDEX "automation_definitions_space_idx" ON "automation_definitions" USING btree ("space_id");
  CREATE INDEX "automation_definitions_owner_idx" ON "automation_definitions" USING btree ("owner_id");
  CREATE INDEX "automation_definitions_updated_at_idx" ON "automation_definitions" USING btree ("updated_at");
  CREATE INDEX "automation_definitions_created_at_idx" ON "automation_definitions" USING btree ("created_at");
  CREATE INDEX "analytics_events_site_idx" ON "analytics_events" USING btree ("site_id");
  CREATE INDEX "analytics_events_publication_idx" ON "analytics_events" USING btree ("publication_id");
  CREATE INDEX "analytics_events_space_idx" ON "analytics_events" USING btree ("space_id");
  CREATE INDEX "analytics_events_owner_idx" ON "analytics_events" USING btree ("owner_id");
  CREATE UNIQUE INDEX "analytics_events_event_id_idx" ON "analytics_events" USING btree ("event_id");
  CREATE UNIQUE INDEX "analytics_events_dedupe_key_idx" ON "analytics_events" USING btree ("dedupe_key");
  CREATE INDEX "analytics_events_event_type_idx" ON "analytics_events" USING btree ("event_type");
  CREATE INDEX "analytics_events_occurred_at_idx" ON "analytics_events" USING btree ("occurred_at");
  CREATE INDEX "analytics_events_anonymous_hash_idx" ON "analytics_events" USING btree ("anonymous_hash");
  CREATE INDEX "analytics_events_session_hash_idx" ON "analytics_events" USING btree ("session_hash");
  CREATE INDEX "analytics_events_member_idx" ON "analytics_events" USING btree ("member_id");
  CREATE INDEX "analytics_events_updated_at_idx" ON "analytics_events" USING btree ("updated_at");
  CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");
  CREATE INDEX "site_occurredAt_idx" ON "analytics_events" USING btree ("site_id","occurred_at");
  CREATE INDEX "site_eventType_occurredAt_idx" ON "analytics_events" USING btree ("site_id","event_type","occurred_at");
  CREATE INDEX "analytics_rollups_site_idx" ON "analytics_rollups" USING btree ("site_id");
  CREATE INDEX "analytics_rollups_publication_idx" ON "analytics_rollups" USING btree ("publication_id");
  CREATE INDEX "analytics_rollups_space_idx" ON "analytics_rollups" USING btree ("space_id");
  CREATE INDEX "analytics_rollups_owner_idx" ON "analytics_rollups" USING btree ("owner_id");
  CREATE INDEX "analytics_rollups_metric_idx" ON "analytics_rollups" USING btree ("metric");
  CREATE INDEX "analytics_rollups_window_start_idx" ON "analytics_rollups" USING btree ("window_start");
  CREATE INDEX "analytics_rollups_updated_at_idx" ON "analytics_rollups" USING btree ("updated_at");
  CREATE INDEX "analytics_rollups_created_at_idx" ON "analytics_rollups" USING btree ("created_at");
  CREATE INDEX "site_metric_windowStart_idx" ON "analytics_rollups" USING btree ("site_id","metric","window_start");
  CREATE INDEX "metric_snapshots_site_idx" ON "metric_snapshots" USING btree ("site_id");
  CREATE INDEX "metric_snapshots_publication_idx" ON "metric_snapshots" USING btree ("publication_id");
  CREATE INDEX "metric_snapshots_space_idx" ON "metric_snapshots" USING btree ("space_id");
  CREATE INDEX "metric_snapshots_owner_idx" ON "metric_snapshots" USING btree ("owner_id");
  CREATE INDEX "metric_snapshots_metric_idx" ON "metric_snapshots" USING btree ("metric");
  CREATE UNIQUE INDEX "metric_snapshots_source_reference_idx" ON "metric_snapshots" USING btree ("source_reference");
  CREATE INDEX "metric_snapshots_updated_at_idx" ON "metric_snapshots" USING btree ("updated_at");
  CREATE INDEX "metric_snapshots_created_at_idx" ON "metric_snapshots" USING btree ("created_at");
  CREATE INDEX "analytics_goals_site_idx" ON "analytics_goals" USING btree ("site_id");
  CREATE INDEX "analytics_goals_publication_idx" ON "analytics_goals" USING btree ("publication_id");
  CREATE INDEX "analytics_goals_space_idx" ON "analytics_goals" USING btree ("space_id");
  CREATE INDEX "analytics_goals_owner_idx" ON "analytics_goals" USING btree ("owner_id");
  CREATE INDEX "analytics_goals_updated_at_idx" ON "analytics_goals" USING btree ("updated_at");
  CREATE INDEX "analytics_goals_created_at_idx" ON "analytics_goals" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_key_idx" ON "analytics_goals" USING btree ("site_id","key");
  CREATE UNIQUE INDEX "command_center_preferences_user_idx" ON "command_center_preferences" USING btree ("user_id");
  CREATE INDEX "command_center_preferences_updated_at_idx" ON "command_center_preferences" USING btree ("updated_at");
  CREATE INDEX "command_center_preferences_created_at_idx" ON "command_center_preferences" USING btree ("created_at");
  CREATE INDEX "experience_rules_site_idx" ON "experience_rules" USING btree ("site_id");
  CREATE INDEX "experience_rules_publication_idx" ON "experience_rules" USING btree ("publication_id");
  CREATE INDEX "experience_rules_space_idx" ON "experience_rules" USING btree ("space_id");
  CREATE INDEX "experience_rules_owner_idx" ON "experience_rules" USING btree ("owner_id");
  CREATE INDEX "experience_rules_approved_by_idx" ON "experience_rules" USING btree ("approved_by_id");
  CREATE INDEX "experience_rules_updated_at_idx" ON "experience_rules" USING btree ("updated_at");
  CREATE INDEX "experience_rules_created_at_idx" ON "experience_rules" USING btree ("created_at");
  CREATE INDEX "experience_variants_site_idx" ON "experience_variants" USING btree ("site_id");
  CREATE INDEX "experience_variants_publication_idx" ON "experience_variants" USING btree ("publication_id");
  CREATE INDEX "experience_variants_space_idx" ON "experience_variants" USING btree ("space_id");
  CREATE INDEX "experience_variants_owner_idx" ON "experience_variants" USING btree ("owner_id");
  CREATE INDEX "experience_variants_rule_idx" ON "experience_variants" USING btree ("rule_id");
  CREATE INDEX "experience_variants_content_revision_idx" ON "experience_variants" USING btree ("content_revision_id");
  CREATE INDEX "experience_variants_updated_at_idx" ON "experience_variants" USING btree ("updated_at");
  CREATE INDEX "experience_variants_created_at_idx" ON "experience_variants" USING btree ("created_at");
  CREATE INDEX "experiments_site_idx" ON "experiments" USING btree ("site_id");
  CREATE INDEX "experiments_publication_idx" ON "experiments" USING btree ("publication_id");
  CREATE INDEX "experiments_space_idx" ON "experiments" USING btree ("space_id");
  CREATE INDEX "experiments_owner_idx" ON "experiments" USING btree ("owner_id");
  CREATE INDEX "experiments_rule_idx" ON "experiments" USING btree ("rule_id");
  CREATE INDEX "experiments_conversion_goal_idx" ON "experiments" USING btree ("conversion_goal_id");
  CREATE INDEX "experiments_approved_by_idx" ON "experiments" USING btree ("approved_by_id");
  CREATE INDEX "experiments_updated_at_idx" ON "experiments" USING btree ("updated_at");
  CREATE INDEX "experiments_created_at_idx" ON "experiments" USING btree ("created_at");
  CREATE INDEX "experiment_variants_site_idx" ON "experiment_variants" USING btree ("site_id");
  CREATE INDEX "experiment_variants_publication_idx" ON "experiment_variants" USING btree ("publication_id");
  CREATE INDEX "experiment_variants_space_idx" ON "experiment_variants" USING btree ("space_id");
  CREATE INDEX "experiment_variants_owner_idx" ON "experiment_variants" USING btree ("owner_id");
  CREATE INDEX "experiment_variants_experiment_idx" ON "experiment_variants" USING btree ("experiment_id");
  CREATE INDEX "experiment_variants_experience_variant_idx" ON "experiment_variants" USING btree ("experience_variant_id");
  CREATE INDEX "experiment_variants_updated_at_idx" ON "experiment_variants" USING btree ("updated_at");
  CREATE INDEX "experiment_variants_created_at_idx" ON "experiment_variants" USING btree ("created_at");
  CREATE UNIQUE INDEX "experiment_name_idx" ON "experiment_variants" USING btree ("experiment_id","name");
  CREATE INDEX "traffic_allocations_site_idx" ON "traffic_allocations" USING btree ("site_id");
  CREATE INDEX "traffic_allocations_publication_idx" ON "traffic_allocations" USING btree ("publication_id");
  CREATE INDEX "traffic_allocations_space_idx" ON "traffic_allocations" USING btree ("space_id");
  CREATE INDEX "traffic_allocations_owner_idx" ON "traffic_allocations" USING btree ("owner_id");
  CREATE INDEX "traffic_allocations_experiment_idx" ON "traffic_allocations" USING btree ("experiment_id");
  CREATE INDEX "traffic_allocations_variant_idx" ON "traffic_allocations" USING btree ("variant_id");
  CREATE INDEX "traffic_allocations_updated_at_idx" ON "traffic_allocations" USING btree ("updated_at");
  CREATE INDEX "traffic_allocations_created_at_idx" ON "traffic_allocations" USING btree ("created_at");
  CREATE INDEX "experiment_assignments_site_idx" ON "experiment_assignments" USING btree ("site_id");
  CREATE INDEX "experiment_assignments_publication_idx" ON "experiment_assignments" USING btree ("publication_id");
  CREATE INDEX "experiment_assignments_space_idx" ON "experiment_assignments" USING btree ("space_id");
  CREATE INDEX "experiment_assignments_owner_idx" ON "experiment_assignments" USING btree ("owner_id");
  CREATE INDEX "experiment_assignments_experiment_idx" ON "experiment_assignments" USING btree ("experiment_id");
  CREATE INDEX "experiment_assignments_variant_idx" ON "experiment_assignments" USING btree ("variant_id");
  CREATE UNIQUE INDEX "experiment_assignments_dedupe_key_idx" ON "experiment_assignments" USING btree ("dedupe_key");
  CREATE INDEX "experiment_assignments_updated_at_idx" ON "experiment_assignments" USING btree ("updated_at");
  CREATE INDEX "experiment_assignments_created_at_idx" ON "experiment_assignments" USING btree ("created_at");
  CREATE UNIQUE INDEX "experiment_subjectKey_idx" ON "experiment_assignments" USING btree ("experiment_id","subject_key");
  CREATE INDEX "conversion_goals_site_idx" ON "conversion_goals" USING btree ("site_id");
  CREATE INDEX "conversion_goals_publication_idx" ON "conversion_goals" USING btree ("publication_id");
  CREATE INDEX "conversion_goals_space_idx" ON "conversion_goals" USING btree ("space_id");
  CREATE INDEX "conversion_goals_owner_idx" ON "conversion_goals" USING btree ("owner_id");
  CREATE INDEX "conversion_goals_updated_at_idx" ON "conversion_goals" USING btree ("updated_at");
  CREATE INDEX "conversion_goals_created_at_idx" ON "conversion_goals" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_key_1_idx" ON "conversion_goals" USING btree ("site_id","key");
  CREATE INDEX "experiment_events_site_idx" ON "experiment_events" USING btree ("site_id");
  CREATE INDEX "experiment_events_publication_idx" ON "experiment_events" USING btree ("publication_id");
  CREATE INDEX "experiment_events_space_idx" ON "experiment_events" USING btree ("space_id");
  CREATE INDEX "experiment_events_owner_idx" ON "experiment_events" USING btree ("owner_id");
  CREATE INDEX "experiment_events_experiment_idx" ON "experiment_events" USING btree ("experiment_id");
  CREATE INDEX "experiment_events_variant_idx" ON "experiment_events" USING btree ("variant_id");
  CREATE INDEX "experiment_events_assignment_idx" ON "experiment_events" USING btree ("assignment_id");
  CREATE UNIQUE INDEX "experiment_events_dedupe_key_idx" ON "experiment_events" USING btree ("dedupe_key");
  CREATE INDEX "experiment_events_updated_at_idx" ON "experiment_events" USING btree ("updated_at");
  CREATE INDEX "experiment_events_created_at_idx" ON "experiment_events" USING btree ("created_at");
  CREATE INDEX "experiment_analyses_site_idx" ON "experiment_analyses" USING btree ("site_id");
  CREATE INDEX "experiment_analyses_publication_idx" ON "experiment_analyses" USING btree ("publication_id");
  CREATE INDEX "experiment_analyses_space_idx" ON "experiment_analyses" USING btree ("space_id");
  CREATE INDEX "experiment_analyses_owner_idx" ON "experiment_analyses" USING btree ("owner_id");
  CREATE INDEX "experiment_analyses_experiment_idx" ON "experiment_analyses" USING btree ("experiment_id");
  CREATE INDEX "experiment_analyses_updated_at_idx" ON "experiment_analyses" USING btree ("updated_at");
  CREATE INDEX "experiment_analyses_created_at_idx" ON "experiment_analyses" USING btree ("created_at");
  CREATE INDEX "experiment_decisions_site_idx" ON "experiment_decisions" USING btree ("site_id");
  CREATE INDEX "experiment_decisions_publication_idx" ON "experiment_decisions" USING btree ("publication_id");
  CREATE INDEX "experiment_decisions_space_idx" ON "experiment_decisions" USING btree ("space_id");
  CREATE INDEX "experiment_decisions_owner_idx" ON "experiment_decisions" USING btree ("owner_id");
  CREATE INDEX "experiment_decisions_experiment_idx" ON "experiment_decisions" USING btree ("experiment_id");
  CREATE INDEX "experiment_decisions_selected_variant_idx" ON "experiment_decisions" USING btree ("selected_variant_id");
  CREATE INDEX "experiment_decisions_actor_idx" ON "experiment_decisions" USING btree ("actor_id");
  CREATE INDEX "experiment_decisions_approved_by_idx" ON "experiment_decisions" USING btree ("approved_by_id");
  CREATE INDEX "experiment_decisions_updated_at_idx" ON "experiment_decisions" USING btree ("updated_at");
  CREATE INDEX "experiment_decisions_created_at_idx" ON "experiment_decisions" USING btree ("created_at");
  CREATE INDEX "quality_policies_site_idx" ON "quality_policies" USING btree ("site_id");
  CREATE INDEX "quality_policies_publication_idx" ON "quality_policies" USING btree ("publication_id");
  CREATE INDEX "quality_policies_space_idx" ON "quality_policies" USING btree ("space_id");
  CREATE INDEX "quality_policies_owner_idx" ON "quality_policies" USING btree ("owner_id");
  CREATE INDEX "quality_policies_updated_at_idx" ON "quality_policies" USING btree ("updated_at");
  CREATE INDEX "quality_policies_created_at_idx" ON "quality_policies" USING btree ("created_at");
  CREATE INDEX "quality_rules_site_idx" ON "quality_rules" USING btree ("site_id");
  CREATE INDEX "quality_rules_publication_idx" ON "quality_rules" USING btree ("publication_id");
  CREATE INDEX "quality_rules_space_idx" ON "quality_rules" USING btree ("space_id");
  CREATE INDEX "quality_rules_owner_idx" ON "quality_rules" USING btree ("owner_id");
  CREATE INDEX "quality_rules_policy_idx" ON "quality_rules" USING btree ("policy_id");
  CREATE INDEX "quality_rules_updated_at_idx" ON "quality_rules" USING btree ("updated_at");
  CREATE INDEX "quality_rules_created_at_idx" ON "quality_rules" USING btree ("created_at");
  CREATE INDEX "quality_scans_site_idx" ON "quality_scans" USING btree ("site_id");
  CREATE INDEX "quality_scans_publication_idx" ON "quality_scans" USING btree ("publication_id");
  CREATE INDEX "quality_scans_space_idx" ON "quality_scans" USING btree ("space_id");
  CREATE INDEX "quality_scans_owner_idx" ON "quality_scans" USING btree ("owner_id");
  CREATE INDEX "quality_scans_policy_idx" ON "quality_scans" USING btree ("policy_id");
  CREATE INDEX "quality_scans_updated_at_idx" ON "quality_scans" USING btree ("updated_at");
  CREATE INDEX "quality_scans_created_at_idx" ON "quality_scans" USING btree ("created_at");
  CREATE INDEX "quality_issues_site_idx" ON "quality_issues" USING btree ("site_id");
  CREATE INDEX "quality_issues_publication_idx" ON "quality_issues" USING btree ("publication_id");
  CREATE INDEX "quality_issues_space_idx" ON "quality_issues" USING btree ("space_id");
  CREATE INDEX "quality_issues_scan_idx" ON "quality_issues" USING btree ("scan_id");
  CREATE INDEX "quality_issues_rule_idx" ON "quality_issues" USING btree ("rule_id");
  CREATE UNIQUE INDEX "quality_issues_dedupe_key_idx" ON "quality_issues" USING btree ("dedupe_key");
  CREATE INDEX "quality_issues_owner_idx" ON "quality_issues" USING btree ("owner_id");
  CREATE INDEX "quality_issues_updated_at_idx" ON "quality_issues" USING btree ("updated_at");
  CREATE INDEX "quality_issues_created_at_idx" ON "quality_issues" USING btree ("created_at");
  CREATE INDEX "quality_exceptions_site_idx" ON "quality_exceptions" USING btree ("site_id");
  CREATE INDEX "quality_exceptions_publication_idx" ON "quality_exceptions" USING btree ("publication_id");
  CREATE INDEX "quality_exceptions_space_idx" ON "quality_exceptions" USING btree ("space_id");
  CREATE INDEX "quality_exceptions_owner_idx" ON "quality_exceptions" USING btree ("owner_id");
  CREATE INDEX "quality_exceptions_rule_idx" ON "quality_exceptions" USING btree ("rule_id");
  CREATE INDEX "quality_exceptions_actor_idx" ON "quality_exceptions" USING btree ("actor_id");
  CREATE INDEX "quality_exceptions_updated_at_idx" ON "quality_exceptions" USING btree ("updated_at");
  CREATE INDEX "quality_exceptions_created_at_idx" ON "quality_exceptions" USING btree ("created_at");
  CREATE INDEX "quality_waivers_site_idx" ON "quality_waivers" USING btree ("site_id");
  CREATE INDEX "quality_waivers_publication_idx" ON "quality_waivers" USING btree ("publication_id");
  CREATE INDEX "quality_waivers_space_idx" ON "quality_waivers" USING btree ("space_id");
  CREATE INDEX "quality_waivers_owner_idx" ON "quality_waivers" USING btree ("owner_id");
  CREATE INDEX "quality_waivers_issue_idx" ON "quality_waivers" USING btree ("issue_id");
  CREATE INDEX "quality_waivers_actor_idx" ON "quality_waivers" USING btree ("actor_id");
  CREATE INDEX "quality_waivers_authorized_by_idx" ON "quality_waivers" USING btree ("authorized_by_id");
  CREATE INDEX "quality_waivers_updated_at_idx" ON "quality_waivers" USING btree ("updated_at");
  CREATE INDEX "quality_waivers_created_at_idx" ON "quality_waivers" USING btree ("created_at");
  CREATE INDEX "quality_reports_site_idx" ON "quality_reports" USING btree ("site_id");
  CREATE INDEX "quality_reports_publication_idx" ON "quality_reports" USING btree ("publication_id");
  CREATE INDEX "quality_reports_space_idx" ON "quality_reports" USING btree ("space_id");
  CREATE INDEX "quality_reports_owner_idx" ON "quality_reports" USING btree ("owner_id");
  CREATE INDEX "quality_reports_scan_idx" ON "quality_reports" USING btree ("scan_id");
  CREATE INDEX "quality_reports_updated_at_idx" ON "quality_reports" USING btree ("updated_at");
  CREATE INDEX "quality_reports_created_at_idx" ON "quality_reports" USING btree ("created_at");
  CREATE INDEX "merchant_connections_site_idx" ON "merchant_connections" USING btree ("site_id");
  CREATE INDEX "merchant_connections_publication_idx" ON "merchant_connections" USING btree ("publication_id");
  CREATE INDEX "merchant_connections_space_idx" ON "merchant_connections" USING btree ("space_id");
  CREATE INDEX "merchant_connections_owner_idx" ON "merchant_connections" USING btree ("owner_id");
  CREATE INDEX "merchant_connections_updated_at_idx" ON "merchant_connections" USING btree ("updated_at");
  CREATE INDEX "merchant_connections_created_at_idx" ON "merchant_connections" USING btree ("created_at");
  CREATE INDEX "payment_method_capabilities_site_idx" ON "payment_method_capabilities" USING btree ("site_id");
  CREATE INDEX "payment_method_capabilities_publication_idx" ON "payment_method_capabilities" USING btree ("publication_id");
  CREATE INDEX "payment_method_capabilities_space_idx" ON "payment_method_capabilities" USING btree ("space_id");
  CREATE INDEX "payment_method_capabilities_owner_idx" ON "payment_method_capabilities" USING btree ("owner_id");
  CREATE INDEX "payment_method_capabilities_merchant_connection_idx" ON "payment_method_capabilities" USING btree ("merchant_connection_id");
  CREATE INDEX "payment_method_capabilities_updated_at_idx" ON "payment_method_capabilities" USING btree ("updated_at");
  CREATE INDEX "payment_method_capabilities_created_at_idx" ON "payment_method_capabilities" USING btree ("created_at");
  CREATE INDEX "products_variants_order_idx" ON "products_variants" USING btree ("_order");
  CREATE INDEX "products_variants_parent_id_idx" ON "products_variants" USING btree ("_parent_id");
  CREATE INDEX "products_prices_order_idx" ON "products_prices" USING btree ("_order");
  CREATE INDEX "products_prices_parent_id_idx" ON "products_prices" USING btree ("_parent_id");
  CREATE INDEX "products_site_idx" ON "products" USING btree ("site_id");
  CREATE INDEX "products_publication_idx" ON "products" USING btree ("publication_id");
  CREATE INDEX "products_space_idx" ON "products" USING btree ("space_id");
  CREATE INDEX "products_owner_idx" ON "products" USING btree ("owner_id");
  CREATE INDEX "products_merchant_connection_idx" ON "products" USING btree ("merchant_connection_id");
  CREATE UNIQUE INDEX "products_canonical_path_idx" ON "products" USING btree ("canonical_path");
  CREATE INDEX "products_categories_idx" ON "products" USING btree ("categories_id");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_slug_1_idx" ON "products" USING btree ("site_id","slug");
  CREATE INDEX "products_rels_order_idx" ON "products_rels" USING btree ("order");
  CREATE INDEX "products_rels_parent_idx" ON "products_rels" USING btree ("parent_id");
  CREATE INDEX "products_rels_path_idx" ON "products_rels" USING btree ("path");
  CREATE INDEX "products_rels_albums_id_idx" ON "products_rels" USING btree ("albums_id");
  CREATE INDEX "products_rels_media_assets_id_idx" ON "products_rels" USING btree ("media_assets_id");
  CREATE INDEX "carts_site_idx" ON "carts" USING btree ("site_id");
  CREATE INDEX "carts_publication_idx" ON "carts" USING btree ("publication_id");
  CREATE INDEX "carts_space_idx" ON "carts" USING btree ("space_id");
  CREATE INDEX "carts_owner_idx" ON "carts" USING btree ("owner_id");
  CREATE INDEX "carts_merchant_connection_idx" ON "carts" USING btree ("merchant_connection_id");
  CREATE INDEX "carts_idempotency_key_idx" ON "carts" USING btree ("idempotency_key");
  CREATE INDEX "carts_updated_at_idx" ON "carts" USING btree ("updated_at");
  CREATE INDEX "carts_created_at_idx" ON "carts" USING btree ("created_at");
  CREATE INDEX "checkout_sessions_site_idx" ON "checkout_sessions" USING btree ("site_id");
  CREATE INDEX "checkout_sessions_publication_idx" ON "checkout_sessions" USING btree ("publication_id");
  CREATE INDEX "checkout_sessions_space_idx" ON "checkout_sessions" USING btree ("space_id");
  CREATE INDEX "checkout_sessions_owner_idx" ON "checkout_sessions" USING btree ("owner_id");
  CREATE INDEX "checkout_sessions_cart_idx" ON "checkout_sessions" USING btree ("cart_id");
  CREATE INDEX "checkout_sessions_merchant_connection_idx" ON "checkout_sessions" USING btree ("merchant_connection_id");
  CREATE INDEX "checkout_sessions_idempotency_key_idx" ON "checkout_sessions" USING btree ("idempotency_key");
  CREATE INDEX "checkout_sessions_updated_at_idx" ON "checkout_sessions" USING btree ("updated_at");
  CREATE INDEX "checkout_sessions_created_at_idx" ON "checkout_sessions" USING btree ("created_at");
  CREATE INDEX "payment_intents_site_idx" ON "payment_intents" USING btree ("site_id");
  CREATE INDEX "payment_intents_publication_idx" ON "payment_intents" USING btree ("publication_id");
  CREATE INDEX "payment_intents_space_idx" ON "payment_intents" USING btree ("space_id");
  CREATE INDEX "payment_intents_owner_idx" ON "payment_intents" USING btree ("owner_id");
  CREATE INDEX "payment_intents_checkout_session_idx" ON "payment_intents" USING btree ("checkout_session_id");
  CREATE INDEX "payment_intents_merchant_connection_idx" ON "payment_intents" USING btree ("merchant_connection_id");
  CREATE INDEX "payment_intents_provider_reference_idx" ON "payment_intents" USING btree ("provider_reference");
  CREATE INDEX "payment_intents_updated_at_idx" ON "payment_intents" USING btree ("updated_at");
  CREATE INDEX "payment_intents_created_at_idx" ON "payment_intents" USING btree ("created_at");
  CREATE INDEX "orders_site_idx" ON "orders" USING btree ("site_id");
  CREATE INDEX "orders_publication_idx" ON "orders" USING btree ("publication_id");
  CREATE INDEX "orders_space_idx" ON "orders" USING btree ("space_id");
  CREATE INDEX "orders_owner_idx" ON "orders" USING btree ("owner_id");
  CREATE INDEX "orders_checkout_session_idx" ON "orders" USING btree ("checkout_session_id");
  CREATE INDEX "orders_merchant_connection_idx" ON "orders" USING btree ("merchant_connection_id");
  CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "payment_webhook_events_merchant_connection_idx" ON "payment_webhook_events" USING btree ("merchant_connection_id");
  CREATE INDEX "payment_webhook_events_updated_at_idx" ON "payment_webhook_events" USING btree ("updated_at");
  CREATE INDEX "payment_webhook_events_created_at_idx" ON "payment_webhook_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "providerKey_providerEventId_idx" ON "payment_webhook_events" USING btree ("provider_key","provider_event_id");
  CREATE INDEX "supporters_site_idx" ON "supporters" USING btree ("site_id");
  CREATE INDEX "supporters_publication_idx" ON "supporters" USING btree ("publication_id");
  CREATE INDEX "supporters_space_idx" ON "supporters" USING btree ("space_id");
  CREATE INDEX "supporters_owner_idx" ON "supporters" USING btree ("owner_id");
  CREATE INDEX "supporters_member_idx" ON "supporters" USING btree ("member_id");
  CREATE INDEX "supporters_email_hash_idx" ON "supporters" USING btree ("email_hash");
  CREATE INDEX "supporters_updated_at_idx" ON "supporters" USING btree ("updated_at");
  CREATE INDEX "supporters_created_at_idx" ON "supporters" USING btree ("created_at");
  CREATE INDEX "entitlements_site_idx" ON "entitlements" USING btree ("site_id");
  CREATE INDEX "entitlements_publication_idx" ON "entitlements" USING btree ("publication_id");
  CREATE INDEX "entitlements_space_idx" ON "entitlements" USING btree ("space_id");
  CREATE INDEX "entitlements_owner_idx" ON "entitlements" USING btree ("owner_id");
  CREATE INDEX "entitlements_supporter_idx" ON "entitlements" USING btree ("supporter_id");
  CREATE INDEX "entitlements_campaign_idx" ON "entitlements" USING btree ("campaign_id");
  CREATE INDEX "entitlements_payment_intent_idx" ON "entitlements" USING btree ("payment_intent_id");
  CREATE INDEX "entitlements_updated_at_idx" ON "entitlements" USING btree ("updated_at");
  CREATE INDEX "entitlements_created_at_idx" ON "entitlements" USING btree ("created_at");
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_email_messages_fk" FOREIGN KEY ("email_messages_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_calendar_entry_id_calendar_entries_id_fk" FOREIGN KEY ("calendar_entry_id") REFERENCES "public"."calendar_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_releases_fk" FOREIGN KEY ("content_releases_id") REFERENCES "public"."content_releases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_definitions_fk" FOREIGN KEY ("form_definitions_id") REFERENCES "public"."form_definitions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_schemas_fk" FOREIGN KEY ("form_schemas_id") REFERENCES "public"."form_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_submissions_fk" FOREIGN KEY ("form_submissions_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_submission_attachments_fk" FOREIGN KEY ("submission_attachments_id") REFERENCES "public"."submission_attachments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contacts_fk" FOREIGN KEY ("contacts_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organizations_fk" FOREIGN KEY ("organizations_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_relationship_records_fk" FOREIGN KEY ("relationship_records_id") REFERENCES "public"."relationship_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contact_tags_fk" FOREIGN KEY ("contact_tags_id") REFERENCES "public"."contact_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contact_taggings_fk" FOREIGN KEY ("contact_taggings_id") REFERENCES "public"."contact_taggings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_interaction_records_fk" FOREIGN KEY ("interaction_records_id") REFERENCES "public"."interaction_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_relationship_notes_fk" FOREIGN KEY ("relationship_notes_id") REFERENCES "public"."relationship_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_deals_opportunities_fk" FOREIGN KEY ("deals_opportunities_id") REFERENCES "public"."deals_opportunities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_owner_assignments_fk" FOREIGN KEY ("owner_assignments_id") REFERENCES "public"."owner_assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_next_actions_fk" FOREIGN KEY ("next_actions_id") REFERENCES "public"."next_actions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_workflow_items_fk" FOREIGN KEY ("workflow_items_id") REFERENCES "public"."workflow_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audience_lists_fk" FOREIGN KEY ("audience_lists_id") REFERENCES "public"."audience_lists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audience_segments_fk" FOREIGN KEY ("audience_segments_id") REFERENCES "public"."audience_segments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audience_memberships_fk" FOREIGN KEY ("audience_memberships_id") REFERENCES "public"."audience_memberships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscriber_confirmation_tok_fk" FOREIGN KEY ("subscriber_confirmation_tokens_id") REFERENCES "public"."subscriber_confirmation_tokens"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscribers_fk" FOREIGN KEY ("subscribers_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consent_events_fk" FOREIGN KEY ("consent_events_id") REFERENCES "public"."consent_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_preferences_fk" FOREIGN KEY ("preferences_id") REFERENCES "public"."preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_suppressions_fk" FOREIGN KEY ("suppressions_id") REFERENCES "public"."suppressions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_messages_fk" FOREIGN KEY ("email_messages_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_delivery_identities_fk" FOREIGN KEY ("delivery_identities_id") REFERENCES "public"."delivery_identities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_deliveries_fk" FOREIGN KEY ("email_deliveries_id") REFERENCES "public"."email_deliveries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_activity_events_fk" FOREIGN KEY ("activity_events_id") REFERENCES "public"."activity_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notification_preferences_fk" FOREIGN KEY ("notification_preferences_id") REFERENCES "public"."notification_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notification_channels_fk" FOREIGN KEY ("notification_channels_id") REFERENCES "public"."notification_channels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_digest_definitions_fk" FOREIGN KEY ("digest_definitions_id") REFERENCES "public"."digest_definitions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_digest_runs_fk" FOREIGN KEY ("digest_runs_id") REFERENCES "public"."digest_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_delivery_receipts_fk" FOREIGN KEY ("delivery_receipts_id") REFERENCES "public"."delivery_receipts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_automation_definitions_fk" FOREIGN KEY ("automation_definitions_id") REFERENCES "public"."automation_definitions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_events_fk" FOREIGN KEY ("analytics_events_id") REFERENCES "public"."analytics_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_rollups_fk" FOREIGN KEY ("analytics_rollups_id") REFERENCES "public"."analytics_rollups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_metric_snapshots_fk" FOREIGN KEY ("metric_snapshots_id") REFERENCES "public"."metric_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_goals_fk" FOREIGN KEY ("analytics_goals_id") REFERENCES "public"."analytics_goals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_command_center_preferences_fk" FOREIGN KEY ("command_center_preferences_id") REFERENCES "public"."command_center_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experience_rules_fk" FOREIGN KEY ("experience_rules_id") REFERENCES "public"."experience_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experience_variants_fk" FOREIGN KEY ("experience_variants_id") REFERENCES "public"."experience_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiments_fk" FOREIGN KEY ("experiments_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiment_variants_fk" FOREIGN KEY ("experiment_variants_id") REFERENCES "public"."experiment_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_traffic_allocations_fk" FOREIGN KEY ("traffic_allocations_id") REFERENCES "public"."traffic_allocations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiment_assignments_fk" FOREIGN KEY ("experiment_assignments_id") REFERENCES "public"."experiment_assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_conversion_goals_fk" FOREIGN KEY ("conversion_goals_id") REFERENCES "public"."conversion_goals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiment_events_fk" FOREIGN KEY ("experiment_events_id") REFERENCES "public"."experiment_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiment_analyses_fk" FOREIGN KEY ("experiment_analyses_id") REFERENCES "public"."experiment_analyses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiment_decisions_fk" FOREIGN KEY ("experiment_decisions_id") REFERENCES "public"."experiment_decisions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_policies_fk" FOREIGN KEY ("quality_policies_id") REFERENCES "public"."quality_policies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_rules_fk" FOREIGN KEY ("quality_rules_id") REFERENCES "public"."quality_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_scans_fk" FOREIGN KEY ("quality_scans_id") REFERENCES "public"."quality_scans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_issues_fk" FOREIGN KEY ("quality_issues_id") REFERENCES "public"."quality_issues"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_exceptions_fk" FOREIGN KEY ("quality_exceptions_id") REFERENCES "public"."quality_exceptions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_waivers_fk" FOREIGN KEY ("quality_waivers_id") REFERENCES "public"."quality_waivers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_reports_fk" FOREIGN KEY ("quality_reports_id") REFERENCES "public"."quality_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_merchant_connections_fk" FOREIGN KEY ("merchant_connections_id") REFERENCES "public"."merchant_connections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_method_capabilities_fk" FOREIGN KEY ("payment_method_capabilities_id") REFERENCES "public"."payment_method_capabilities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_carts_fk" FOREIGN KEY ("carts_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_checkout_sessions_fk" FOREIGN KEY ("checkout_sessions_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_intents_fk" FOREIGN KEY ("payment_intents_id") REFERENCES "public"."payment_intents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_webhook_events_fk" FOREIGN KEY ("payment_webhook_events_id") REFERENCES "public"."payment_webhook_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_supporters_fk" FOREIGN KEY ("supporters_id") REFERENCES "public"."supporters"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_entitlements_fk" FOREIGN KEY ("entitlements_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "media_usages_rels_email_messages_id_idx" ON "media_usages_rels" USING btree ("email_messages_id");
  CREATE INDEX "graphic_documents_site_idx" ON "graphic_documents" USING btree ("site_id");
  CREATE INDEX "graphic_documents_publication_idx" ON "graphic_documents" USING btree ("publication_id");
  CREATE INDEX "graphic_documents_space_idx" ON "graphic_documents" USING btree ("space_id");
  CREATE INDEX "graphic_documents_owner_idx" ON "graphic_documents" USING btree ("owner_id");
  CREATE INDEX "campaigns_calendar_entry_idx" ON "campaigns" USING btree ("calendar_entry_id");
  CREATE INDEX "payload_locked_documents_rels_content_releases_id_idx" ON "payload_locked_documents_rels" USING btree ("content_releases_id");
  CREATE INDEX "payload_locked_documents_rels_form_definitions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_definitions_id");
  CREATE INDEX "payload_locked_documents_rels_form_schemas_id_idx" ON "payload_locked_documents_rels" USING btree ("form_schemas_id");
  CREATE INDEX "payload_locked_documents_rels_form_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_submissions_id");
  CREATE INDEX "payload_locked_documents_rels_submission_attachments_id_idx" ON "payload_locked_documents_rels" USING btree ("submission_attachments_id");
  CREATE INDEX "payload_locked_documents_rels_contacts_id_idx" ON "payload_locked_documents_rels" USING btree ("contacts_id");
  CREATE INDEX "payload_locked_documents_rels_organizations_id_idx" ON "payload_locked_documents_rels" USING btree ("organizations_id");
  CREATE INDEX "payload_locked_documents_rels_relationship_records_id_idx" ON "payload_locked_documents_rels" USING btree ("relationship_records_id");
  CREATE INDEX "payload_locked_documents_rels_contact_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("contact_tags_id");
  CREATE INDEX "payload_locked_documents_rels_contact_taggings_id_idx" ON "payload_locked_documents_rels" USING btree ("contact_taggings_id");
  CREATE INDEX "payload_locked_documents_rels_interaction_records_id_idx" ON "payload_locked_documents_rels" USING btree ("interaction_records_id");
  CREATE INDEX "payload_locked_documents_rels_relationship_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("relationship_notes_id");
  CREATE INDEX "payload_locked_documents_rels_deals_opportunities_id_idx" ON "payload_locked_documents_rels" USING btree ("deals_opportunities_id");
  CREATE INDEX "payload_locked_documents_rels_owner_assignments_id_idx" ON "payload_locked_documents_rels" USING btree ("owner_assignments_id");
  CREATE INDEX "payload_locked_documents_rels_next_actions_id_idx" ON "payload_locked_documents_rels" USING btree ("next_actions_id");
  CREATE INDEX "payload_locked_documents_rels_workflow_items_id_idx" ON "payload_locked_documents_rels" USING btree ("workflow_items_id");
  CREATE INDEX "payload_locked_documents_rels_audience_lists_id_idx" ON "payload_locked_documents_rels" USING btree ("audience_lists_id");
  CREATE INDEX "payload_locked_documents_rels_audience_segments_id_idx" ON "payload_locked_documents_rels" USING btree ("audience_segments_id");
  CREATE INDEX "payload_locked_documents_rels_audience_memberships_id_idx" ON "payload_locked_documents_rels" USING btree ("audience_memberships_id");
  CREATE INDEX "payload_locked_documents_rels_subscriber_confirmation_to_idx" ON "payload_locked_documents_rels" USING btree ("subscriber_confirmation_tokens_id");
  CREATE INDEX "payload_locked_documents_rels_subscribers_id_idx" ON "payload_locked_documents_rels" USING btree ("subscribers_id");
  CREATE INDEX "payload_locked_documents_rels_consent_events_id_idx" ON "payload_locked_documents_rels" USING btree ("consent_events_id");
  CREATE INDEX "payload_locked_documents_rels_preferences_id_idx" ON "payload_locked_documents_rels" USING btree ("preferences_id");
  CREATE INDEX "payload_locked_documents_rels_suppressions_id_idx" ON "payload_locked_documents_rels" USING btree ("suppressions_id");
  CREATE INDEX "payload_locked_documents_rels_email_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("email_messages_id");
  CREATE INDEX "payload_locked_documents_rels_delivery_identities_id_idx" ON "payload_locked_documents_rels" USING btree ("delivery_identities_id");
  CREATE INDEX "payload_locked_documents_rels_email_deliveries_id_idx" ON "payload_locked_documents_rels" USING btree ("email_deliveries_id");
  CREATE INDEX "payload_locked_documents_rels_activity_events_id_idx" ON "payload_locked_documents_rels" USING btree ("activity_events_id");
  CREATE INDEX "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");
  CREATE INDEX "payload_locked_documents_rels_notification_preferences_i_idx" ON "payload_locked_documents_rels" USING btree ("notification_preferences_id");
  CREATE INDEX "payload_locked_documents_rels_notification_channels_id_idx" ON "payload_locked_documents_rels" USING btree ("notification_channels_id");
  CREATE INDEX "payload_locked_documents_rels_digest_definitions_id_idx" ON "payload_locked_documents_rels" USING btree ("digest_definitions_id");
  CREATE INDEX "payload_locked_documents_rels_digest_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("digest_runs_id");
  CREATE INDEX "payload_locked_documents_rels_delivery_receipts_id_idx" ON "payload_locked_documents_rels" USING btree ("delivery_receipts_id");
  CREATE INDEX "payload_locked_documents_rels_automation_definitions_id_idx" ON "payload_locked_documents_rels" USING btree ("automation_definitions_id");
  CREATE INDEX "payload_locked_documents_rels_analytics_events_id_idx" ON "payload_locked_documents_rels" USING btree ("analytics_events_id");
  CREATE INDEX "payload_locked_documents_rels_analytics_rollups_id_idx" ON "payload_locked_documents_rels" USING btree ("analytics_rollups_id");
  CREATE INDEX "payload_locked_documents_rels_metric_snapshots_id_idx" ON "payload_locked_documents_rels" USING btree ("metric_snapshots_id");
  CREATE INDEX "payload_locked_documents_rels_analytics_goals_id_idx" ON "payload_locked_documents_rels" USING btree ("analytics_goals_id");
  CREATE INDEX "payload_locked_documents_rels_command_center_preferences_idx" ON "payload_locked_documents_rels" USING btree ("command_center_preferences_id");
  CREATE INDEX "payload_locked_documents_rels_experience_rules_id_idx" ON "payload_locked_documents_rels" USING btree ("experience_rules_id");
  CREATE INDEX "payload_locked_documents_rels_experience_variants_id_idx" ON "payload_locked_documents_rels" USING btree ("experience_variants_id");
  CREATE INDEX "payload_locked_documents_rels_experiments_id_idx" ON "payload_locked_documents_rels" USING btree ("experiments_id");
  CREATE INDEX "payload_locked_documents_rels_experiment_variants_id_idx" ON "payload_locked_documents_rels" USING btree ("experiment_variants_id");
  CREATE INDEX "payload_locked_documents_rels_traffic_allocations_id_idx" ON "payload_locked_documents_rels" USING btree ("traffic_allocations_id");
  CREATE INDEX "payload_locked_documents_rels_experiment_assignments_id_idx" ON "payload_locked_documents_rels" USING btree ("experiment_assignments_id");
  CREATE INDEX "payload_locked_documents_rels_conversion_goals_id_idx" ON "payload_locked_documents_rels" USING btree ("conversion_goals_id");
  CREATE INDEX "payload_locked_documents_rels_experiment_events_id_idx" ON "payload_locked_documents_rels" USING btree ("experiment_events_id");
  CREATE INDEX "payload_locked_documents_rels_experiment_analyses_id_idx" ON "payload_locked_documents_rels" USING btree ("experiment_analyses_id");
  CREATE INDEX "payload_locked_documents_rels_experiment_decisions_id_idx" ON "payload_locked_documents_rels" USING btree ("experiment_decisions_id");
  CREATE INDEX "payload_locked_documents_rels_quality_policies_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_policies_id");
  CREATE INDEX "payload_locked_documents_rels_quality_rules_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_rules_id");
  CREATE INDEX "payload_locked_documents_rels_quality_scans_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_scans_id");
  CREATE INDEX "payload_locked_documents_rels_quality_issues_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_issues_id");
  CREATE INDEX "payload_locked_documents_rels_quality_exceptions_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_exceptions_id");
  CREATE INDEX "payload_locked_documents_rels_quality_waivers_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_waivers_id");
  CREATE INDEX "payload_locked_documents_rels_quality_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_reports_id");
  CREATE INDEX "payload_locked_documents_rels_merchant_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("merchant_connections_id");
  CREATE INDEX "payload_locked_documents_rels_payment_method_capabilitie_idx" ON "payload_locked_documents_rels" USING btree ("payment_method_capabilities_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_carts_id_idx" ON "payload_locked_documents_rels" USING btree ("carts_id");
  CREATE INDEX "payload_locked_documents_rels_checkout_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("checkout_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_payment_intents_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_intents_id");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_payment_webhook_events_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_webhook_events_id");
  CREATE INDEX "payload_locked_documents_rels_supporters_id_idx" ON "payload_locked_documents_rels" USING btree ("supporters_id");
  CREATE INDEX "payload_locked_documents_rels_entitlements_id_idx" ON "payload_locked_documents_rels" USING btree ("entitlements_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "content_releases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "form_definitions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "form_schemas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "form_submissions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "submission_attachments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "contacts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "relationship_records" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "contact_tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "contact_taggings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "interaction_records" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "relationship_notes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "deals_opportunities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "owner_assignments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "next_actions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "workflow_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "workflow_items_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audience_lists" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audience_segments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audience_memberships" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subscriber_confirmation_tokens" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subscribers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "consent_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "preferences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "suppressions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "delivery_identities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_deliveries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "activity_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notification_preferences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notification_channels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "digest_definitions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "digest_runs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "delivery_receipts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "automation_definitions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "analytics_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "analytics_rollups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "metric_snapshots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "analytics_goals" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "command_center_preferences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experience_rules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experience_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiment_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "traffic_allocations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiment_assignments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "conversion_goals" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiment_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiment_analyses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiment_decisions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_policies" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_rules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_scans" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_issues" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_exceptions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_waivers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_reports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "merchant_connections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_method_capabilities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_prices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "carts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "checkout_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_intents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_webhook_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "supporters" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "entitlements" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "content_releases" CASCADE;
  DROP TABLE "form_definitions" CASCADE;
  DROP TABLE "form_schemas" CASCADE;
  DROP TABLE "form_submissions" CASCADE;
  DROP TABLE "submission_attachments" CASCADE;
  DROP TABLE "contacts" CASCADE;
  DROP TABLE "organizations" CASCADE;
  DROP TABLE "relationship_records" CASCADE;
  DROP TABLE "contact_tags" CASCADE;
  DROP TABLE "contact_taggings" CASCADE;
  DROP TABLE "interaction_records" CASCADE;
  DROP TABLE "relationship_notes" CASCADE;
  DROP TABLE "deals_opportunities" CASCADE;
  DROP TABLE "owner_assignments" CASCADE;
  DROP TABLE "next_actions" CASCADE;
  DROP TABLE "workflow_items" CASCADE;
  DROP TABLE "workflow_items_rels" CASCADE;
  DROP TABLE "audience_lists" CASCADE;
  DROP TABLE "audience_segments" CASCADE;
  DROP TABLE "audience_memberships" CASCADE;
  DROP TABLE "subscriber_confirmation_tokens" CASCADE;
  DROP TABLE "subscribers" CASCADE;
  DROP TABLE "consent_events" CASCADE;
  DROP TABLE "preferences" CASCADE;
  DROP TABLE "suppressions" CASCADE;
  DROP TABLE "email_messages" CASCADE;
  DROP TABLE "delivery_identities" CASCADE;
  DROP TABLE "email_deliveries" CASCADE;
  DROP TABLE "activity_events" CASCADE;
  DROP TABLE "notifications" CASCADE;
  DROP TABLE "notification_preferences" CASCADE;
  DROP TABLE "notification_channels" CASCADE;
  DROP TABLE "digest_definitions" CASCADE;
  DROP TABLE "digest_runs" CASCADE;
  DROP TABLE "delivery_receipts" CASCADE;
  DROP TABLE "automation_definitions" CASCADE;
  DROP TABLE "analytics_events" CASCADE;
  DROP TABLE "analytics_rollups" CASCADE;
  DROP TABLE "metric_snapshots" CASCADE;
  DROP TABLE "analytics_goals" CASCADE;
  DROP TABLE "command_center_preferences" CASCADE;
  DROP TABLE "experience_rules" CASCADE;
  DROP TABLE "experience_variants" CASCADE;
  DROP TABLE "experiments" CASCADE;
  DROP TABLE "experiment_variants" CASCADE;
  DROP TABLE "traffic_allocations" CASCADE;
  DROP TABLE "experiment_assignments" CASCADE;
  DROP TABLE "conversion_goals" CASCADE;
  DROP TABLE "experiment_events" CASCADE;
  DROP TABLE "experiment_analyses" CASCADE;
  DROP TABLE "experiment_decisions" CASCADE;
  DROP TABLE "quality_policies" CASCADE;
  DROP TABLE "quality_rules" CASCADE;
  DROP TABLE "quality_scans" CASCADE;
  DROP TABLE "quality_issues" CASCADE;
  DROP TABLE "quality_exceptions" CASCADE;
  DROP TABLE "quality_waivers" CASCADE;
  DROP TABLE "quality_reports" CASCADE;
  DROP TABLE "merchant_connections" CASCADE;
  DROP TABLE "payment_method_capabilities" CASCADE;
  DROP TABLE "products_variants" CASCADE;
  DROP TABLE "products_prices" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "products_rels" CASCADE;
  DROP TABLE "carts" CASCADE;
  DROP TABLE "checkout_sessions" CASCADE;
  DROP TABLE "payment_intents" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "payment_webhook_events" CASCADE;
  DROP TABLE "supporters" CASCADE;
  DROP TABLE "entitlements" CASCADE;
  ALTER TABLE "media_usages_rels" DROP CONSTRAINT "media_usages_rels_email_messages_fk";
  
  ALTER TABLE "graphic_documents" DROP CONSTRAINT "graphic_documents_site_id_sites_id_fk";
  
  ALTER TABLE "graphic_documents" DROP CONSTRAINT "graphic_documents_publication_id_publications_id_fk";
  
  ALTER TABLE "graphic_documents" DROP CONSTRAINT "graphic_documents_space_id_spaces_id_fk";
  
  ALTER TABLE "graphic_documents" DROP CONSTRAINT "graphic_documents_owner_id_members_id_fk";
  
  ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_calendar_entry_id_calendar_entries_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_content_releases_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_definitions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_schemas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_submissions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_submission_attachments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_contacts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organizations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_relationship_records_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_contact_tags_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_contact_taggings_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_interaction_records_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_relationship_notes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_deals_opportunities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_owner_assignments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_next_actions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_workflow_items_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audience_lists_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audience_segments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audience_memberships_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subscriber_confirmation_tok_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subscribers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_consent_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_preferences_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_suppressions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_messages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_delivery_identities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_deliveries_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_activity_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notifications_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notification_preferences_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notification_channels_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_digest_definitions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_digest_runs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_delivery_receipts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_automation_definitions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_analytics_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_analytics_rollups_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_metric_snapshots_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_analytics_goals_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_command_center_preferences_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experience_rules_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experience_variants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiment_variants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_traffic_allocations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiment_assignments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_conversion_goals_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiment_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiment_analyses_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiment_decisions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_policies_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_rules_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_scans_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_issues_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_exceptions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_waivers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_reports_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_merchant_connections_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payment_method_capabilities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_products_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_carts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_checkout_sessions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payment_intents_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_orders_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payment_webhook_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_supporters_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_entitlements_fk";
  
  ALTER TABLE "media_usages" ALTER COLUMN "purpose" SET DATA TYPE text;
  DROP TYPE "public"."enum_media_usages_purpose";
  DO $$ BEGIN
    CREATE TYPE "public"."enum_media_usages_purpose" AS ENUM('hero', 'inline', 'cover', 'attachment', 'avatar', 'thumbnail');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  ALTER TABLE "media_usages" ALTER COLUMN "purpose" SET DATA TYPE "public"."enum_media_usages_purpose" USING "purpose"::"public"."enum_media_usages_purpose";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish', 'media-import', 'media-render', 'media-transcribe', 'media-tts', 'social-publish');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish', 'media-import', 'media-render', 'media-transcribe', 'media-tts', 'social-publish');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "media_usages_rels_email_messages_id_idx";
  DROP INDEX "graphic_documents_site_idx";
  DROP INDEX "graphic_documents_publication_idx";
  DROP INDEX "graphic_documents_space_idx";
  DROP INDEX "graphic_documents_owner_idx";
  DROP INDEX "campaigns_calendar_entry_idx";
  DROP INDEX "payload_locked_documents_rels_content_releases_id_idx";
  DROP INDEX "payload_locked_documents_rels_form_definitions_id_idx";
  DROP INDEX "payload_locked_documents_rels_form_schemas_id_idx";
  DROP INDEX "payload_locked_documents_rels_form_submissions_id_idx";
  DROP INDEX "payload_locked_documents_rels_submission_attachments_id_idx";
  DROP INDEX "payload_locked_documents_rels_contacts_id_idx";
  DROP INDEX "payload_locked_documents_rels_organizations_id_idx";
  DROP INDEX "payload_locked_documents_rels_relationship_records_id_idx";
  DROP INDEX "payload_locked_documents_rels_contact_tags_id_idx";
  DROP INDEX "payload_locked_documents_rels_contact_taggings_id_idx";
  DROP INDEX "payload_locked_documents_rels_interaction_records_id_idx";
  DROP INDEX "payload_locked_documents_rels_relationship_notes_id_idx";
  DROP INDEX "payload_locked_documents_rels_deals_opportunities_id_idx";
  DROP INDEX "payload_locked_documents_rels_owner_assignments_id_idx";
  DROP INDEX "payload_locked_documents_rels_next_actions_id_idx";
  DROP INDEX "payload_locked_documents_rels_workflow_items_id_idx";
  DROP INDEX "payload_locked_documents_rels_audience_lists_id_idx";
  DROP INDEX "payload_locked_documents_rels_audience_segments_id_idx";
  DROP INDEX "payload_locked_documents_rels_audience_memberships_id_idx";
  DROP INDEX "payload_locked_documents_rels_subscriber_confirmation_to_idx";
  DROP INDEX "payload_locked_documents_rels_subscribers_id_idx";
  DROP INDEX "payload_locked_documents_rels_consent_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_preferences_id_idx";
  DROP INDEX "payload_locked_documents_rels_suppressions_id_idx";
  DROP INDEX "payload_locked_documents_rels_email_messages_id_idx";
  DROP INDEX "payload_locked_documents_rels_delivery_identities_id_idx";
  DROP INDEX "payload_locked_documents_rels_email_deliveries_id_idx";
  DROP INDEX "payload_locked_documents_rels_activity_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_notifications_id_idx";
  DROP INDEX "payload_locked_documents_rels_notification_preferences_i_idx";
  DROP INDEX "payload_locked_documents_rels_notification_channels_id_idx";
  DROP INDEX "payload_locked_documents_rels_digest_definitions_id_idx";
  DROP INDEX "payload_locked_documents_rels_digest_runs_id_idx";
  DROP INDEX "payload_locked_documents_rels_delivery_receipts_id_idx";
  DROP INDEX "payload_locked_documents_rels_automation_definitions_id_idx";
  DROP INDEX "payload_locked_documents_rels_analytics_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_analytics_rollups_id_idx";
  DROP INDEX "payload_locked_documents_rels_metric_snapshots_id_idx";
  DROP INDEX "payload_locked_documents_rels_analytics_goals_id_idx";
  DROP INDEX "payload_locked_documents_rels_command_center_preferences_idx";
  DROP INDEX "payload_locked_documents_rels_experience_rules_id_idx";
  DROP INDEX "payload_locked_documents_rels_experience_variants_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiments_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiment_variants_id_idx";
  DROP INDEX "payload_locked_documents_rels_traffic_allocations_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiment_assignments_id_idx";
  DROP INDEX "payload_locked_documents_rels_conversion_goals_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiment_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiment_analyses_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiment_decisions_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_policies_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_rules_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_scans_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_issues_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_exceptions_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_waivers_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_reports_id_idx";
  DROP INDEX "payload_locked_documents_rels_merchant_connections_id_idx";
  DROP INDEX "payload_locked_documents_rels_payment_method_capabilitie_idx";
  DROP INDEX "payload_locked_documents_rels_products_id_idx";
  DROP INDEX "payload_locked_documents_rels_carts_id_idx";
  DROP INDEX "payload_locked_documents_rels_checkout_sessions_id_idx";
  DROP INDEX "payload_locked_documents_rels_payment_intents_id_idx";
  DROP INDEX "payload_locked_documents_rels_orders_id_idx";
  DROP INDEX "payload_locked_documents_rels_payment_webhook_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_supporters_id_idx";
  DROP INDEX "payload_locked_documents_rels_entitlements_id_idx";
  ALTER TABLE "media_assets" DROP COLUMN "rights_status";
  ALTER TABLE "media_usages_rels" DROP COLUMN "email_messages_id";
  ALTER TABLE "graphic_documents" DROP COLUMN "site_id";
  ALTER TABLE "graphic_documents" DROP COLUMN "publication_id";
  ALTER TABLE "graphic_documents" DROP COLUMN "space_id";
  ALTER TABLE "graphic_documents" DROP COLUMN "owner_id";
  ALTER TABLE "graphic_documents" DROP COLUMN "template";
  ALTER TABLE "graphic_documents" DROP COLUMN "layout_variant";
  ALTER TABLE "campaigns" DROP COLUMN "visibility";
  ALTER TABLE "campaigns" DROP COLUMN "start_at";
  ALTER TABLE "campaigns" DROP COLUMN "end_at";
  ALTER TABLE "campaigns" DROP COLUMN "goal";
  ALTER TABLE "campaigns" DROP COLUMN "milestones";
  ALTER TABLE "campaigns" DROP COLUMN "updates";
  ALTER TABLE "campaigns" DROP COLUMN "tiers";
  ALTER TABLE "campaigns" DROP COLUMN "progress";
  ALTER TABLE "campaigns" DROP COLUMN "calendar_entry_id";
  ALTER TABLE "campaigns" DROP COLUMN "supporter_visibility";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "content_releases_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_definitions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_schemas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_submissions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "submission_attachments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "contacts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organizations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "relationship_records_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "contact_tags_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "contact_taggings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "interaction_records_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "relationship_notes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "deals_opportunities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "owner_assignments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "next_actions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "workflow_items_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audience_lists_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audience_segments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audience_memberships_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subscriber_confirmation_tokens_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subscribers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "consent_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "preferences_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "suppressions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "email_messages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "delivery_identities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "email_deliveries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "activity_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notifications_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notification_preferences_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notification_channels_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "digest_definitions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "digest_runs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "delivery_receipts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "automation_definitions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "analytics_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "analytics_rollups_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "metric_snapshots_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "analytics_goals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "command_center_preferences_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experience_rules_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experience_variants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiment_variants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "traffic_allocations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiment_assignments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "conversion_goals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiment_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiment_analyses_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiment_decisions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_policies_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_rules_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_scans_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_issues_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_exceptions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_waivers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_reports_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "merchant_connections_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payment_method_capabilities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "products_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "carts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "checkout_sessions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payment_intents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "orders_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payment_webhook_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "supporters_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "entitlements_id";
  DROP TYPE "public"."enum_media_assets_rights_status";
  DROP TYPE "public"."enum_content_releases_status";
  DROP TYPE "public"."enum_campaigns_visibility";
  DROP TYPE "public"."enum_campaigns_supporter_visibility";
  DROP TYPE "public"."enum_form_definitions_template";
  DROP TYPE "public"."enum_form_definitions_visibility";
  DROP TYPE "public"."enum_form_definitions_retention_mode";
  DROP TYPE "public"."enum_form_definitions_retention_hold";
  DROP TYPE "public"."enum_form_schemas_state";
  DROP TYPE "public"."enum_form_schemas_consent_translation_status";
  DROP TYPE "public"."enum_form_submissions_status";
  DROP TYPE "public"."enum_form_submissions_privacy_class";
  DROP TYPE "public"."enum_form_submissions_retention_mode";
  DROP TYPE "public"."enum_form_submissions_retention_hold";
  DROP TYPE "public"."enum_submission_attachments_scan_status";
  DROP TYPE "public"."enum_contacts_status";
  DROP TYPE "public"."enum_contacts_merge_state";
  DROP TYPE "public"."enum_contacts_retention_mode";
  DROP TYPE "public"."enum_contacts_retention_hold";
  DROP TYPE "public"."enum_organizations_status";
  DROP TYPE "public"."enum_organizations_retention_mode";
  DROP TYPE "public"."enum_organizations_retention_hold";
  DROP TYPE "public"."enum_interaction_records_kind";
  DROP TYPE "public"."enum_deals_opportunities_stage";
  DROP TYPE "public"."enum_next_actions_status";
  DROP TYPE "public"."enum_workflow_items_type";
  DROP TYPE "public"."enum_workflow_items_status";
  DROP TYPE "public"."enum_workflow_items_priority";
  DROP TYPE "public"."enum_audience_lists_status";
  DROP TYPE "public"."enum_audience_segments_status";
  DROP TYPE "public"."enum_audience_memberships_status";
  DROP TYPE "public"."enum_subscribers_status";
  DROP TYPE "public"."enum_consent_events_event";
  DROP TYPE "public"."enum_suppressions_reason";
  DROP TYPE "public"."enum_email_messages_kind";
  DROP TYPE "public"."enum_email_messages_status";
  DROP TYPE "public"."enum_email_deliveries_status";
  DROP TYPE "public"."enum_notifications_status";
  DROP TYPE "public"."enum_notification_channels_kind";
  DROP TYPE "public"."enum_digest_definitions_cadence";
  DROP TYPE "public"."enum_digest_runs_status";
  DROP TYPE "public"."enum_delivery_receipts_channel";
  DROP TYPE "public"."enum_delivery_receipts_status";
  DROP TYPE "public"."enum_automation_definitions_status";
  DROP TYPE "public"."enum_analytics_events_consent_basis";
  DROP TYPE "public"."enum_analytics_events_retention_mode";
  DROP TYPE "public"."enum_analytics_events_retention_hold";
  DROP TYPE "public"."enum_analytics_rollups_grain";
  DROP TYPE "public"."enum_analytics_rollups_retention_mode";
  DROP TYPE "public"."enum_analytics_rollups_retention_hold";
  DROP TYPE "public"."enum_metric_snapshots_grain";
  DROP TYPE "public"."enum_metric_snapshots_reconciliation_status";
  DROP TYPE "public"."enum_metric_snapshots_retention_mode";
  DROP TYPE "public"."enum_metric_snapshots_retention_hold";
  DROP TYPE "public"."enum_experience_rules_status";
  DROP TYPE "public"."enum_experience_variants_status";
  DROP TYPE "public"."enum_experiments_state";
  DROP TYPE "public"."enum_experiment_events_kind";
  DROP TYPE "public"."enum_experiment_decisions_decision";
  DROP TYPE "public"."enum_quality_policies_status";
  DROP TYPE "public"."enum_quality_rules_severity";
  DROP TYPE "public"."enum_quality_scans_target_type";
  DROP TYPE "public"."enum_quality_scans_status";
  DROP TYPE "public"."enum_quality_issues_severity";
  DROP TYPE "public"."enum_quality_issues_status";
  DROP TYPE "public"."enum_merchant_connections_status";
  DROP TYPE "public"."enum_payment_method_capabilities_family";
  DROP TYPE "public"."enum_payment_method_capabilities_flow";
  DROP TYPE "public"."enum_payment_method_capabilities_health";
  DROP TYPE "public"."enum_products_variants_inventory_policy";
  DROP TYPE "public"."enum_products_prices_recurring_interval";
  DROP TYPE "public"."enum_products_kind";
  DROP TYPE "public"."enum_products_state";
  DROP TYPE "public"."enum_products_retention_mode";
  DROP TYPE "public"."enum_products_retention_hold";
  DROP TYPE "public"."enum_carts_state";
  DROP TYPE "public"."enum_checkout_sessions_state";
  DROP TYPE "public"."enum_payment_intents_state";
  DROP TYPE "public"."enum_orders_state";
  DROP TYPE "public"."enum_supporters_visibility_preference";`)
}

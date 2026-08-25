import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_brands_kind" AS ENUM('organization', 'personal');
  CREATE TYPE "public"."enum_members_status" AS ENUM('active', 'disabled', 'archived');
  CREATE TYPE "public"."enum_profiles_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_spaces_capabilities_status" AS ENUM('enabled', 'disabled');
  CREATE TYPE "public"."enum_spaces_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_spaces_moderation_state" AS ENUM('clear', 'review', 'restricted', 'removed');
  CREATE TYPE "public"."enum_spaces_transfer_state" AS ENUM('none', 'pending', 'completed');
  CREATE TYPE "public"."enum_publications_capabilities_status" AS ENUM('enabled', 'disabled');
  CREATE TYPE "public"."enum_publications_status" AS ENUM('draft', 'active', 'suspended', 'archived');
  CREATE TYPE "public"."enum_publications_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_relationships_kind" AS ENUM('follow', 'friend', 'block', 'mute', 'publication-membership', 'content-association', 'curation');
  CREATE TYPE "public"."enum_relationships_status" AS ENUM('pending', 'active', 'blocked', 'archived');
  CREATE TYPE "public"."enum_relationships_role" AS ENUM('owner', 'editor', 'author', 'moderator', 'member');
  CREATE TYPE "public"."enum_relationships_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_media_assets_kind" AS ENUM('image', 'audio', 'video', 'document', 'cover', 'thumbnail', 'graphic');
  CREATE TYPE "public"."enum_media_assets_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_media_assets_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TYPE "public"."enum_sections_scope" AS ENUM('site', 'publication');
  CREATE TYPE "public"."enum_categories_scope" AS ENUM('site', 'publication');
  CREATE TYPE "public"."enum_topics_scope" AS ENUM('site', 'publication');
  CREATE TYPE "public"."enum_tags_scope" AS ENUM('site', 'publication');
  CREATE TYPE "public"."enum_series_scope" AS ENUM('site', 'publication');
  CREATE TYPE "public"."enum_taxonomy_redirects_reason" AS ENUM('rename', 'move');
  CREATE TYPE "public"."enum_content_content_type" AS ENUM('article', 'page', 'book', 'podcast', 'video', 'product', 'event', 'campaign');
  CREATE TYPE "public"."enum_content_status" AS ENUM('draft', 'review', 'published', 'scheduled', 'archived');
  CREATE TYPE "public"."enum_content_comments_policy" AS ENUM('open', 'members', 'closed');
  CREATE TYPE "public"."enum_content_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_content_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TYPE "public"."enum_sources_source_type" AS ENUM('article', 'book', 'report', 'dataset', 'interview', 'website', 'other');
  CREATE TYPE "public"."enum_albums_kind" AS ENUM('album', 'portfolio');
  CREATE TYPE "public"."enum_albums_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_albums_original_download_policy" AS ENUM('allowed', 'members', 'disallowed');
  CREATE TYPE "public"."enum_albums_exif_policy" AS ENUM('strip', 'private', 'display');
  CREATE TYPE "public"."enum_albums_comments_policy" AS ENUM('open', 'members', 'closed');
  CREATE TYPE "public"."enum_albums_moderation_state" AS ENUM('clear', 'review', 'restricted', 'removed');
  CREATE TYPE "public"."enum_albums_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_albums_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TYPE "public"."enum_media_usages_purpose" AS ENUM('hero', 'inline', 'cover', 'attachment', 'avatar', 'thumbnail');
  CREATE TYPE "public"."enum_discussions_kind" AS ENUM('attached', 'thread');
  CREATE TYPE "public"."enum_discussions_status" AS ENUM('open', 'locked', 'archived');
  CREATE TYPE "public"."enum_discussions_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_discussions_moderation_state" AS ENUM('clear', 'review', 'restricted', 'removed');
  CREATE TYPE "public"."enum_discussions_comments_policy" AS ENUM('open', 'members', 'closed');
  CREATE TYPE "public"."enum_discussions_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_discussions_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TYPE "public"."enum_discussion_posts_status" AS ENUM('draft', 'published', 'hidden', 'removed');
  CREATE TYPE "public"."enum_discussion_posts_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_discussion_posts_moderation_state" AS ENUM('clear', 'review', 'restricted', 'removed');
  CREATE TYPE "public"."enum_discussion_posts_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_discussion_posts_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TYPE "public"."enum_calendar_entries_status" AS ENUM('draft', 'scheduled', 'in-progress', 'completed', 'cancelled', 'archived');
  CREATE TYPE "public"."enum_calendar_entries_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_calendar_entries_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_calendar_entries_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TABLE "brands" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"legal_name" varchar,
  	"kind" "enum_brands_kind" DEFAULT 'organization' NOT NULL,
  	"tagline" varchar,
  	"mission" varchar,
  	"description" varchar,
  	"bio" varchar,
  	"logo_id" uuid,
  	"favicon_id" uuid,
  	"colors" jsonb,
  	"typography" jsonb,
  	"contact_defaults" jsonb,
  	"social_defaults" jsonb,
  	"primary_author_id" uuid,
  	"audience" varchar,
  	"voice" varchar,
  	"vocabulary" jsonb,
  	"avoided_phrases" jsonb,
  	"graphic_style" varchar,
  	"seo_defaults" jsonb,
  	"social_defaults_override" jsonb,
  	"newsletter_defaults" jsonb,
  	"disclosures" varchar,
  	"structured_data_defaults" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "members" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"display_name" varchar NOT NULL,
  	"email" varchar,
  	"status" "enum_members_status" DEFAULT 'active' NOT NULL,
  	"disabled_at" timestamp(3) with time zone,
  	"archived_at" timestamp(3) with time zone,
  	"export_requested_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "profiles" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"display_name" varchar NOT NULL,
  	"avatar_id" uuid,
  	"cover_id" uuid,
  	"bio" varchar,
  	"visibility" "enum_profiles_visibility" DEFAULT 'public' NOT NULL,
  	"field_audience" jsonb,
  	"layout_theme" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "spaces_capabilities" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"status" "enum_spaces_capabilities_status" DEFAULT 'enabled' NOT NULL
  );
  
  CREATE TABLE "spaces" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"profile_id" uuid,
  	"handle" varchar NOT NULL,
  	"canonical_path" varchar DEFAULT '/members/' NOT NULL,
  	"display_name" varchar NOT NULL,
  	"avatar_id" uuid,
  	"cover_id" uuid,
  	"bio" varchar,
  	"visibility" "enum_spaces_visibility" DEFAULT 'public' NOT NULL,
  	"field_audience" jsonb,
  	"layout_theme" jsonb,
  	"quota_policy" jsonb,
  	"provider_ownership" jsonb,
  	"moderation_state" "enum_spaces_moderation_state" DEFAULT 'clear' NOT NULL,
  	"suspended_at" timestamp(3) with time zone,
  	"transfer_to_member_id" uuid,
  	"transfer_state" "enum_spaces_transfer_state" DEFAULT 'none',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "authors" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"display_name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"member_id" uuid,
  	"bio" varchar,
  	"avatar_id" uuid,
  	"website" varchar,
  	"social_links" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "publications_capabilities" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"status" "enum_publications_capabilities_status" DEFAULT 'enabled' NOT NULL
  );
  
  CREATE TABLE "publications" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"owner_id" uuid,
  	"space_id" uuid,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"canonical_base_path" varchar DEFAULT '/blogs/' NOT NULL,
  	"status" "enum_publications_status" DEFAULT 'draft' NOT NULL,
  	"visibility" "enum_publications_visibility" DEFAULT 'public' NOT NULL,
  	"brand_id" uuid,
  	"profile_id" uuid,
  	"brand_overrides" jsonb,
  	"theme_preset" varchar,
  	"moderation_policy" jsonb,
  	"feature_policy" jsonb,
  	"quota_policy" jsonb,
  	"navigation" jsonb,
  	"feeds" jsonb,
  	"seo_defaults" jsonb,
  	"suspended_at" timestamp(3) with time zone,
  	"archived_at" timestamp(3) with time zone,
  	"archive_message" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "relationships" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"subject_id" uuid NOT NULL,
  	"kind" "enum_relationships_kind" NOT NULL,
  	"status" "enum_relationships_status" DEFAULT 'active' NOT NULL,
  	"role" "enum_relationships_role",
  	"visibility" "enum_relationships_visibility" DEFAULT 'private' NOT NULL,
  	"started_at" timestamp(3) with time zone,
  	"ended_at" timestamp(3) with time zone,
  	"pair_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "relationships_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"members_id" uuid,
  	"publications_id" uuid,
  	"content_id" uuid,
  	"albums_id" uuid,
  	"media_assets_id" uuid
  );
  
  CREATE TABLE "media_assets_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"location" varchar NOT NULL,
  	"mime_type" varchar
  );
  
  CREATE TABLE "media_assets" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"kind" "enum_media_assets_kind" NOT NULL,
  	"storage_location" varchar NOT NULL,
  	"storage_provider" varchar DEFAULT 'local' NOT NULL,
  	"mime_type" varchar,
  	"size_bytes" numeric,
  	"width" numeric,
  	"height" numeric,
  	"duration_seconds" numeric,
  	"alt_text" varchar,
  	"caption" varchar,
  	"credits" varchar,
  	"license" varchar,
  	"replace_globally_with_id" uuid,
  	"original_export_allowed" boolean DEFAULT true,
  	"retention_mode" "enum_media_assets_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_media_assets_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media_assets_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" uuid,
  	"albums_id" uuid
  );
  
  CREATE TABLE "sections" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"scope" "enum_sections_scope" DEFAULT 'publication' NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"scope" "enum_categories_scope" DEFAULT 'publication' NOT NULL,
  	"section_id" uuid,
  	"parent_id" uuid,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"canonical_path" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "topics" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"scope" "enum_topics_scope" DEFAULT 'publication' NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"scope" "enum_tags_scope" DEFAULT 'publication' NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "series" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"scope" "enum_series_scope" DEFAULT 'publication' NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "taxonomy_redirects" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"from_path" varchar NOT NULL,
  	"to_path" varchar NOT NULL,
  	"reason" "enum_taxonomy_redirects_reason" NOT NULL,
  	"target_category_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "content_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"author_id" uuid NOT NULL,
  	"display_order" numeric DEFAULT 0 NOT NULL,
  	"role" varchar
  );
  
  CREATE TABLE "content" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"content_type" "enum_content_content_type" NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"canonical_path" varchar NOT NULL,
  	"summary" varchar,
  	"status" "enum_content_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"updated_at_editorial" timestamp(3) with time zone,
  	"hero_media_id" uuid,
  	"seo_override" jsonb,
  	"social_override" jsonb,
  	"comments_policy" "enum_content_comments_policy" DEFAULT 'open' NOT NULL,
  	"revision_compatibility" jsonb,
  	"audit_metadata" jsonb,
  	"retention_mode" "enum_content_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_content_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "content_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"sections_id" uuid,
  	"categories_id" uuid,
  	"topics_id" uuid,
  	"tags_id" uuid,
  	"series_id" uuid,
  	"relationships_id" uuid
  );
  
  CREATE TABLE "sources" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"title" varchar NOT NULL,
  	"publisher" varchar,
  	"authors" jsonb,
  	"url" varchar NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"accessed_at" timestamp(3) with time zone,
  	"source_type" "enum_sources_source_type" NOT NULL,
  	"excerpt" varchar,
  	"quote_metadata" jsonb,
  	"archive_metadata" jsonb,
  	"credibility_notes" varchar,
  	"editorial_notes" varchar,
  	"reuse_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "albums_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" uuid NOT NULL,
  	"display_order" numeric DEFAULT 0 NOT NULL,
  	"caption" varchar,
  	"alt_text" varchar,
  	"credits" varchar,
  	"license" varchar
  );
  
  CREATE TABLE "albums" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"kind" "enum_albums_kind" NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"canonical_path" varchar NOT NULL,
  	"description" varchar,
  	"cover_id" uuid,
  	"visibility" "enum_albums_visibility" DEFAULT 'public' NOT NULL,
  	"original_download_policy" "enum_albums_original_download_policy" DEFAULT 'allowed' NOT NULL,
  	"exif_policy" "enum_albums_exif_policy" DEFAULT 'strip' NOT NULL,
  	"comments_policy" "enum_albums_comments_policy" DEFAULT 'open' NOT NULL,
  	"moderation_state" "enum_albums_moderation_state" DEFAULT 'clear' NOT NULL,
  	"export_requested_at" timestamp(3) with time zone,
  	"retention_mode" "enum_albums_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_albums_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media_usages" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"media_id" uuid NOT NULL,
  	"usage_key" varchar NOT NULL,
  	"purpose" "enum_media_usages_purpose" NOT NULL,
  	"replace_globally" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media_usages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"content_id" uuid,
  	"albums_id" uuid,
  	"discussions_id" uuid,
  	"discussion_posts_id" uuid
  );
  
  CREATE TABLE "forum_sections" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "forums" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"section_id" uuid NOT NULL,
  	"parent_id" uuid,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discussions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"kind" "enum_discussions_kind" NOT NULL,
  	"title" varchar NOT NULL,
  	"forum_id" uuid,
  	"promoted_content_id" uuid,
  	"canonical_path" varchar NOT NULL,
  	"status" "enum_discussions_status" DEFAULT 'open' NOT NULL,
  	"visibility" "enum_discussions_visibility" DEFAULT 'public' NOT NULL,
  	"moderation_state" "enum_discussions_moderation_state" DEFAULT 'clear' NOT NULL,
  	"comments_policy" "enum_discussions_comments_policy" DEFAULT 'open' NOT NULL,
  	"retention_mode" "enum_discussions_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_discussions_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discussions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"content_id" uuid,
  	"media_assets_id" uuid,
  	"albums_id" uuid
  );
  
  CREATE TABLE "discussion_posts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"discussion_id" uuid NOT NULL,
  	"author_member_id" uuid,
  	"author_guest_id" uuid,
  	"body" varchar NOT NULL,
  	"parent_id" uuid,
  	"quote_id" uuid,
  	"display_order" numeric DEFAULT 0 NOT NULL,
  	"permalink" varchar NOT NULL,
  	"pagination_anchor" varchar NOT NULL,
  	"status" "enum_discussion_posts_status" DEFAULT 'published' NOT NULL,
  	"visibility" "enum_discussion_posts_visibility" DEFAULT 'public' NOT NULL,
  	"solution" boolean DEFAULT false,
  	"helpful" boolean DEFAULT false,
  	"moderation_state" "enum_discussion_posts_moderation_state" DEFAULT 'clear' NOT NULL,
  	"retention_mode" "enum_discussion_posts_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_discussion_posts_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discussion_posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_assets_id" uuid,
  	"sources_id" uuid
  );
  
  CREATE TABLE "calendar_entries" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"all_day" boolean DEFAULT false,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"ends_at" timestamp(3) with time zone,
  	"time_zone" varchar DEFAULT 'UTC' NOT NULL,
  	"status" "enum_calendar_entries_status" DEFAULT 'scheduled' NOT NULL,
  	"visibility" "enum_calendar_entries_visibility" DEFAULT 'private' NOT NULL,
  	"audience" jsonb,
  	"calendar_placement" varchar,
  	"recurrence" jsonb,
  	"rsvp_registration" jsonb,
  	"conflict_metadata" jsonb,
  	"canonical_path" varchar,
  	"structured_data" jsonb,
  	"retention_mode" "enum_calendar_entries_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_calendar_entries_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "calendar_entries_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"content_id" uuid,
  	"publications_id" uuid,
  	"media_assets_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "brands_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "members_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "profiles_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "spaces_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "authors_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "publications_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "relationships_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_assets_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sections_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "categories_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "topics_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tags_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "series_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "taxonomy_redirects_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sources_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "albums_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_usages_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "forum_sections_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "forums_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discussions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discussion_posts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "calendar_entries_id" uuid;
  ALTER TABLE "brands" ADD CONSTRAINT "brands_logo_id_media_assets_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "brands" ADD CONSTRAINT "brands_favicon_id_media_assets_id_fk" FOREIGN KEY ("favicon_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "brands" ADD CONSTRAINT "brands_primary_author_id_authors_id_fk" FOREIGN KEY ("primary_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profiles" ADD CONSTRAINT "profiles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatar_id_media_assets_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profiles" ADD CONSTRAINT "profiles_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "spaces_capabilities" ADD CONSTRAINT "spaces_capabilities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_avatar_id_media_assets_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_transfer_to_member_id_members_id_fk" FOREIGN KEY ("transfer_to_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_avatar_id_media_assets_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications_capabilities" ADD CONSTRAINT "publications_capabilities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationships" ADD CONSTRAINT "relationships_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationships" ADD CONSTRAINT "relationships_subject_id_members_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_assets_variants" ADD CONSTRAINT "media_assets_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_replace_globally_with_id_media_assets_id_fk" FOREIGN KEY ("replace_globally_with_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_assets_rels" ADD CONSTRAINT "media_assets_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_assets_rels" ADD CONSTRAINT "media_assets_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_assets_rels" ADD CONSTRAINT "media_assets_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sections" ADD CONSTRAINT "sections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sections" ADD CONSTRAINT "sections_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topics" ADD CONSTRAINT "topics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topics" ADD CONSTRAINT "topics_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags" ADD CONSTRAINT "tags_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags" ADD CONSTRAINT "tags_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "series" ADD CONSTRAINT "series_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "series" ADD CONSTRAINT "series_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "taxonomy_redirects" ADD CONSTRAINT "taxonomy_redirects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "taxonomy_redirects" ADD CONSTRAINT "taxonomy_redirects_target_category_id_categories_id_fk" FOREIGN KEY ("target_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_authors" ADD CONSTRAINT "content_authors_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_authors" ADD CONSTRAINT "content_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content" ADD CONSTRAINT "content_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content" ADD CONSTRAINT "content_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content" ADD CONSTRAINT "content_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content" ADD CONSTRAINT "content_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content" ADD CONSTRAINT "content_hero_media_id_media_assets_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_series_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_relationships_fk" FOREIGN KEY ("relationships_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sources" ADD CONSTRAINT "sources_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sources" ADD CONSTRAINT "sources_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sources" ADD CONSTRAINT "sources_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums_items" ADD CONSTRAINT "albums_items_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums_items" ADD CONSTRAINT "albums_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_usages" ADD CONSTRAINT "media_usages_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_usages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_discussions_fk" FOREIGN KEY ("discussions_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_discussion_posts_fk" FOREIGN KEY ("discussion_posts_id") REFERENCES "public"."discussion_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forum_sections" ADD CONSTRAINT "forum_sections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forum_sections" ADD CONSTRAINT "forum_sections_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forum_sections" ADD CONSTRAINT "forum_sections_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forums" ADD CONSTRAINT "forums_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forums" ADD CONSTRAINT "forums_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forums" ADD CONSTRAINT "forums_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forums" ADD CONSTRAINT "forums_section_id_forum_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."forum_sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forums" ADD CONSTRAINT "forums_parent_id_forums_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."forums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_forum_id_forums_id_fk" FOREIGN KEY ("forum_id") REFERENCES "public"."forums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_promoted_content_id_content_id_fk" FOREIGN KEY ("promoted_content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions_rels" ADD CONSTRAINT "discussions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussions_rels" ADD CONSTRAINT "discussions_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussions_rels" ADD CONSTRAINT "discussions_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussions_rels" ADD CONSTRAINT "discussions_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_discussion_id_discussions_id_fk" FOREIGN KEY ("discussion_id") REFERENCES "public"."discussions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_author_member_id_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_author_guest_id_authors_id_fk" FOREIGN KEY ("author_guest_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_parent_id_discussion_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discussion_posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_quote_id_discussion_posts_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."discussion_posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_posts_rels" ADD CONSTRAINT "discussion_posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discussion_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussion_posts_rels" ADD CONSTRAINT "discussion_posts_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussion_posts_rels" ADD CONSTRAINT "discussion_posts_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_entries_rels" ADD CONSTRAINT "calendar_entries_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."calendar_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_entries_rels" ADD CONSTRAINT "calendar_entries_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_entries_rels" ADD CONSTRAINT "calendar_entries_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_entries_rels" ADD CONSTRAINT "calendar_entries_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "brands_logo_idx" ON "brands" USING btree ("logo_id");
  CREATE INDEX "brands_favicon_idx" ON "brands" USING btree ("favicon_id");
  CREATE INDEX "brands_primary_author_idx" ON "brands" USING btree ("primary_author_id");
  CREATE INDEX "brands_updated_at_idx" ON "brands" USING btree ("updated_at");
  CREATE INDEX "brands_created_at_idx" ON "brands" USING btree ("created_at");
  CREATE UNIQUE INDEX "members_email_idx" ON "members" USING btree ("email");
  CREATE INDEX "members_updated_at_idx" ON "members" USING btree ("updated_at");
  CREATE INDEX "members_created_at_idx" ON "members" USING btree ("created_at");
  CREATE UNIQUE INDEX "profiles_member_idx" ON "profiles" USING btree ("member_id");
  CREATE INDEX "profiles_avatar_idx" ON "profiles" USING btree ("avatar_id");
  CREATE INDEX "profiles_cover_idx" ON "profiles" USING btree ("cover_id");
  CREATE INDEX "profiles_updated_at_idx" ON "profiles" USING btree ("updated_at");
  CREATE INDEX "profiles_created_at_idx" ON "profiles" USING btree ("created_at");
  CREATE INDEX "spaces_capabilities_order_idx" ON "spaces_capabilities" USING btree ("_order");
  CREATE INDEX "spaces_capabilities_parent_id_idx" ON "spaces_capabilities" USING btree ("_parent_id");
  CREATE INDEX "spaces_member_idx" ON "spaces" USING btree ("member_id");
  CREATE INDEX "spaces_profile_idx" ON "spaces" USING btree ("profile_id");
  CREATE UNIQUE INDEX "spaces_handle_idx" ON "spaces" USING btree ("handle");
  CREATE UNIQUE INDEX "spaces_canonical_path_idx" ON "spaces" USING btree ("canonical_path");
  CREATE INDEX "spaces_avatar_idx" ON "spaces" USING btree ("avatar_id");
  CREATE INDEX "spaces_cover_idx" ON "spaces" USING btree ("cover_id");
  CREATE INDEX "spaces_transfer_to_member_idx" ON "spaces" USING btree ("transfer_to_member_id");
  CREATE INDEX "spaces_updated_at_idx" ON "spaces" USING btree ("updated_at");
  CREATE INDEX "spaces_created_at_idx" ON "spaces" USING btree ("created_at");
  CREATE UNIQUE INDEX "authors_slug_idx" ON "authors" USING btree ("slug");
  CREATE UNIQUE INDEX "authors_member_idx" ON "authors" USING btree ("member_id");
  CREATE INDEX "authors_avatar_idx" ON "authors" USING btree ("avatar_id");
  CREATE INDEX "authors_updated_at_idx" ON "authors" USING btree ("updated_at");
  CREATE INDEX "authors_created_at_idx" ON "authors" USING btree ("created_at");
  CREATE INDEX "publications_capabilities_order_idx" ON "publications_capabilities" USING btree ("_order");
  CREATE INDEX "publications_capabilities_parent_id_idx" ON "publications_capabilities" USING btree ("_parent_id");
  CREATE INDEX "publications_site_idx" ON "publications" USING btree ("site_id");
  CREATE INDEX "publications_owner_idx" ON "publications" USING btree ("owner_id");
  CREATE INDEX "publications_space_idx" ON "publications" USING btree ("space_id");
  CREATE INDEX "publications_slug_idx" ON "publications" USING btree ("slug");
  CREATE INDEX "publications_brand_idx" ON "publications" USING btree ("brand_id");
  CREATE INDEX "publications_profile_idx" ON "publications" USING btree ("profile_id");
  CREATE INDEX "publications_updated_at_idx" ON "publications" USING btree ("updated_at");
  CREATE INDEX "publications_created_at_idx" ON "publications" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_slug_idx" ON "publications" USING btree ("site_id","slug");
  CREATE INDEX "relationships_site_idx" ON "relationships" USING btree ("site_id");
  CREATE INDEX "relationships_subject_idx" ON "relationships" USING btree ("subject_id");
  CREATE UNIQUE INDEX "relationships_pair_key_idx" ON "relationships" USING btree ("pair_key");
  CREATE INDEX "relationships_updated_at_idx" ON "relationships" USING btree ("updated_at");
  CREATE INDEX "relationships_created_at_idx" ON "relationships" USING btree ("created_at");
  CREATE INDEX "relationships_rels_order_idx" ON "relationships_rels" USING btree ("order");
  CREATE INDEX "relationships_rels_parent_idx" ON "relationships_rels" USING btree ("parent_id");
  CREATE INDEX "relationships_rels_path_idx" ON "relationships_rels" USING btree ("path");
  CREATE INDEX "relationships_rels_members_id_idx" ON "relationships_rels" USING btree ("members_id");
  CREATE INDEX "relationships_rels_publications_id_idx" ON "relationships_rels" USING btree ("publications_id");
  CREATE INDEX "relationships_rels_content_id_idx" ON "relationships_rels" USING btree ("content_id");
  CREATE INDEX "relationships_rels_albums_id_idx" ON "relationships_rels" USING btree ("albums_id");
  CREATE INDEX "relationships_rels_media_assets_id_idx" ON "relationships_rels" USING btree ("media_assets_id");
  CREATE INDEX "media_assets_variants_order_idx" ON "media_assets_variants" USING btree ("_order");
  CREATE INDEX "media_assets_variants_parent_id_idx" ON "media_assets_variants" USING btree ("_parent_id");
  CREATE INDEX "media_assets_site_idx" ON "media_assets" USING btree ("site_id");
  CREATE INDEX "media_assets_publication_idx" ON "media_assets" USING btree ("publication_id");
  CREATE INDEX "media_assets_space_idx" ON "media_assets" USING btree ("space_id");
  CREATE INDEX "media_assets_owner_idx" ON "media_assets" USING btree ("owner_id");
  CREATE UNIQUE INDEX "media_assets_storage_location_idx" ON "media_assets" USING btree ("storage_location");
  CREATE INDEX "media_assets_replace_globally_with_idx" ON "media_assets" USING btree ("replace_globally_with_id");
  CREATE INDEX "media_assets_updated_at_idx" ON "media_assets" USING btree ("updated_at");
  CREATE INDEX "media_assets_created_at_idx" ON "media_assets" USING btree ("created_at");
  CREATE INDEX "media_assets_rels_order_idx" ON "media_assets_rels" USING btree ("order");
  CREATE INDEX "media_assets_rels_parent_idx" ON "media_assets_rels" USING btree ("parent_id");
  CREATE INDEX "media_assets_rels_path_idx" ON "media_assets_rels" USING btree ("path");
  CREATE INDEX "media_assets_rels_tags_id_idx" ON "media_assets_rels" USING btree ("tags_id");
  CREATE INDEX "media_assets_rels_albums_id_idx" ON "media_assets_rels" USING btree ("albums_id");
  CREATE INDEX "sections_site_idx" ON "sections" USING btree ("site_id");
  CREATE INDEX "sections_publication_idx" ON "sections" USING btree ("publication_id");
  CREATE INDEX "sections_updated_at_idx" ON "sections" USING btree ("updated_at");
  CREATE INDEX "sections_created_at_idx" ON "sections" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_publication_slug_idx" ON "sections" USING btree ("site_id","publication_id","slug");
  CREATE INDEX "categories_site_idx" ON "categories" USING btree ("site_id");
  CREATE INDEX "categories_publication_idx" ON "categories" USING btree ("publication_id");
  CREATE INDEX "categories_section_idx" ON "categories" USING btree ("section_id");
  CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_publication_parent_slug_idx" ON "categories" USING btree ("site_id","publication_id","parent_id","slug");
  CREATE INDEX "topics_site_idx" ON "topics" USING btree ("site_id");
  CREATE INDEX "topics_publication_idx" ON "topics" USING btree ("publication_id");
  CREATE INDEX "topics_updated_at_idx" ON "topics" USING btree ("updated_at");
  CREATE INDEX "topics_created_at_idx" ON "topics" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_publication_slug_1_idx" ON "topics" USING btree ("site_id","publication_id","slug");
  CREATE INDEX "tags_site_idx" ON "tags" USING btree ("site_id");
  CREATE INDEX "tags_publication_idx" ON "tags" USING btree ("publication_id");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_publication_slug_2_idx" ON "tags" USING btree ("site_id","publication_id","slug");
  CREATE INDEX "series_site_idx" ON "series" USING btree ("site_id");
  CREATE INDEX "series_publication_idx" ON "series" USING btree ("publication_id");
  CREATE INDEX "series_updated_at_idx" ON "series" USING btree ("updated_at");
  CREATE INDEX "series_created_at_idx" ON "series" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_publication_slug_3_idx" ON "series" USING btree ("site_id","publication_id","slug");
  CREATE INDEX "taxonomy_redirects_site_idx" ON "taxonomy_redirects" USING btree ("site_id");
  CREATE UNIQUE INDEX "taxonomy_redirects_from_path_idx" ON "taxonomy_redirects" USING btree ("from_path");
  CREATE INDEX "taxonomy_redirects_target_category_idx" ON "taxonomy_redirects" USING btree ("target_category_id");
  CREATE INDEX "taxonomy_redirects_updated_at_idx" ON "taxonomy_redirects" USING btree ("updated_at");
  CREATE INDEX "taxonomy_redirects_created_at_idx" ON "taxonomy_redirects" USING btree ("created_at");
  CREATE INDEX "content_authors_order_idx" ON "content_authors" USING btree ("_order");
  CREATE INDEX "content_authors_parent_id_idx" ON "content_authors" USING btree ("_parent_id");
  CREATE INDEX "content_authors_author_idx" ON "content_authors" USING btree ("author_id");
  CREATE INDEX "content_site_idx" ON "content" USING btree ("site_id");
  CREATE INDEX "content_publication_idx" ON "content" USING btree ("publication_id");
  CREATE INDEX "content_space_idx" ON "content" USING btree ("space_id");
  CREATE INDEX "content_owner_idx" ON "content" USING btree ("owner_id");
  CREATE UNIQUE INDEX "content_canonical_path_idx" ON "content" USING btree ("canonical_path");
  CREATE INDEX "content_hero_media_idx" ON "content" USING btree ("hero_media_id");
  CREATE INDEX "content_updated_at_idx" ON "content" USING btree ("updated_at");
  CREATE INDEX "content_created_at_idx" ON "content" USING btree ("created_at");
  CREATE UNIQUE INDEX "publication_slug_idx" ON "content" USING btree ("publication_id","slug");
  CREATE INDEX "content_rels_order_idx" ON "content_rels" USING btree ("order");
  CREATE INDEX "content_rels_parent_idx" ON "content_rels" USING btree ("parent_id");
  CREATE INDEX "content_rels_path_idx" ON "content_rels" USING btree ("path");
  CREATE INDEX "content_rels_sections_id_idx" ON "content_rels" USING btree ("sections_id");
  CREATE INDEX "content_rels_categories_id_idx" ON "content_rels" USING btree ("categories_id");
  CREATE INDEX "content_rels_topics_id_idx" ON "content_rels" USING btree ("topics_id");
  CREATE INDEX "content_rels_tags_id_idx" ON "content_rels" USING btree ("tags_id");
  CREATE INDEX "content_rels_series_id_idx" ON "content_rels" USING btree ("series_id");
  CREATE INDEX "content_rels_relationships_id_idx" ON "content_rels" USING btree ("relationships_id");
  CREATE INDEX "sources_site_idx" ON "sources" USING btree ("site_id");
  CREATE INDEX "sources_publication_idx" ON "sources" USING btree ("publication_id");
  CREATE INDEX "sources_space_idx" ON "sources" USING btree ("space_id");
  CREATE UNIQUE INDEX "sources_url_idx" ON "sources" USING btree ("url");
  CREATE INDEX "sources_updated_at_idx" ON "sources" USING btree ("updated_at");
  CREATE INDEX "sources_created_at_idx" ON "sources" USING btree ("created_at");
  CREATE INDEX "albums_items_order_idx" ON "albums_items" USING btree ("_order");
  CREATE INDEX "albums_items_parent_id_idx" ON "albums_items" USING btree ("_parent_id");
  CREATE INDEX "albums_items_media_idx" ON "albums_items" USING btree ("media_id");
  CREATE INDEX "albums_site_idx" ON "albums" USING btree ("site_id");
  CREATE INDEX "albums_publication_idx" ON "albums" USING btree ("publication_id");
  CREATE INDEX "albums_space_idx" ON "albums" USING btree ("space_id");
  CREATE INDEX "albums_owner_idx" ON "albums" USING btree ("owner_id");
  CREATE UNIQUE INDEX "albums_canonical_path_idx" ON "albums" USING btree ("canonical_path");
  CREATE INDEX "albums_cover_idx" ON "albums" USING btree ("cover_id");
  CREATE INDEX "albums_updated_at_idx" ON "albums" USING btree ("updated_at");
  CREATE INDEX "albums_created_at_idx" ON "albums" USING btree ("created_at");
  CREATE UNIQUE INDEX "publication_slug_1_idx" ON "albums" USING btree ("publication_id","slug");
  CREATE INDEX "media_usages_media_idx" ON "media_usages" USING btree ("media_id");
  CREATE UNIQUE INDEX "media_usages_usage_key_idx" ON "media_usages" USING btree ("usage_key");
  CREATE INDEX "media_usages_updated_at_idx" ON "media_usages" USING btree ("updated_at");
  CREATE INDEX "media_usages_created_at_idx" ON "media_usages" USING btree ("created_at");
  CREATE INDEX "media_usages_rels_order_idx" ON "media_usages_rels" USING btree ("order");
  CREATE INDEX "media_usages_rels_parent_idx" ON "media_usages_rels" USING btree ("parent_id");
  CREATE INDEX "media_usages_rels_path_idx" ON "media_usages_rels" USING btree ("path");
  CREATE INDEX "media_usages_rels_content_id_idx" ON "media_usages_rels" USING btree ("content_id");
  CREATE INDEX "media_usages_rels_albums_id_idx" ON "media_usages_rels" USING btree ("albums_id");
  CREATE INDEX "media_usages_rels_discussions_id_idx" ON "media_usages_rels" USING btree ("discussions_id");
  CREATE INDEX "media_usages_rels_discussion_posts_id_idx" ON "media_usages_rels" USING btree ("discussion_posts_id");
  CREATE INDEX "forum_sections_site_idx" ON "forum_sections" USING btree ("site_id");
  CREATE INDEX "forum_sections_publication_idx" ON "forum_sections" USING btree ("publication_id");
  CREATE INDEX "forum_sections_space_idx" ON "forum_sections" USING btree ("space_id");
  CREATE INDEX "forum_sections_updated_at_idx" ON "forum_sections" USING btree ("updated_at");
  CREATE INDEX "forum_sections_created_at_idx" ON "forum_sections" USING btree ("created_at");
  CREATE INDEX "forums_site_idx" ON "forums" USING btree ("site_id");
  CREATE INDEX "forums_publication_idx" ON "forums" USING btree ("publication_id");
  CREATE INDEX "forums_space_idx" ON "forums" USING btree ("space_id");
  CREATE INDEX "forums_section_idx" ON "forums" USING btree ("section_id");
  CREATE INDEX "forums_parent_idx" ON "forums" USING btree ("parent_id");
  CREATE INDEX "forums_updated_at_idx" ON "forums" USING btree ("updated_at");
  CREATE INDEX "forums_created_at_idx" ON "forums" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_parent_slug_idx" ON "forums" USING btree ("site_id","parent_id","slug");
  CREATE INDEX "discussions_site_idx" ON "discussions" USING btree ("site_id");
  CREATE INDEX "discussions_publication_idx" ON "discussions" USING btree ("publication_id");
  CREATE INDEX "discussions_space_idx" ON "discussions" USING btree ("space_id");
  CREATE INDEX "discussions_owner_idx" ON "discussions" USING btree ("owner_id");
  CREATE INDEX "discussions_forum_idx" ON "discussions" USING btree ("forum_id");
  CREATE INDEX "discussions_promoted_content_idx" ON "discussions" USING btree ("promoted_content_id");
  CREATE UNIQUE INDEX "discussions_canonical_path_idx" ON "discussions" USING btree ("canonical_path");
  CREATE INDEX "discussions_updated_at_idx" ON "discussions" USING btree ("updated_at");
  CREATE INDEX "discussions_created_at_idx" ON "discussions" USING btree ("created_at");
  CREATE INDEX "discussions_rels_order_idx" ON "discussions_rels" USING btree ("order");
  CREATE INDEX "discussions_rels_parent_idx" ON "discussions_rels" USING btree ("parent_id");
  CREATE INDEX "discussions_rels_path_idx" ON "discussions_rels" USING btree ("path");
  CREATE INDEX "discussions_rels_content_id_idx" ON "discussions_rels" USING btree ("content_id");
  CREATE INDEX "discussions_rels_media_assets_id_idx" ON "discussions_rels" USING btree ("media_assets_id");
  CREATE INDEX "discussions_rels_albums_id_idx" ON "discussions_rels" USING btree ("albums_id");
  CREATE INDEX "discussion_posts_discussion_idx" ON "discussion_posts" USING btree ("discussion_id");
  CREATE INDEX "discussion_posts_author_member_idx" ON "discussion_posts" USING btree ("author_member_id");
  CREATE INDEX "discussion_posts_author_guest_idx" ON "discussion_posts" USING btree ("author_guest_id");
  CREATE INDEX "discussion_posts_parent_idx" ON "discussion_posts" USING btree ("parent_id");
  CREATE INDEX "discussion_posts_quote_idx" ON "discussion_posts" USING btree ("quote_id");
  CREATE UNIQUE INDEX "discussion_posts_permalink_idx" ON "discussion_posts" USING btree ("permalink");
  CREATE INDEX "discussion_posts_updated_at_idx" ON "discussion_posts" USING btree ("updated_at");
  CREATE INDEX "discussion_posts_created_at_idx" ON "discussion_posts" USING btree ("created_at");
  CREATE INDEX "discussion_posts_rels_order_idx" ON "discussion_posts_rels" USING btree ("order");
  CREATE INDEX "discussion_posts_rels_parent_idx" ON "discussion_posts_rels" USING btree ("parent_id");
  CREATE INDEX "discussion_posts_rels_path_idx" ON "discussion_posts_rels" USING btree ("path");
  CREATE INDEX "discussion_posts_rels_media_assets_id_idx" ON "discussion_posts_rels" USING btree ("media_assets_id");
  CREATE INDEX "discussion_posts_rels_sources_id_idx" ON "discussion_posts_rels" USING btree ("sources_id");
  CREATE INDEX "calendar_entries_site_idx" ON "calendar_entries" USING btree ("site_id");
  CREATE INDEX "calendar_entries_publication_idx" ON "calendar_entries" USING btree ("publication_id");
  CREATE INDEX "calendar_entries_space_idx" ON "calendar_entries" USING btree ("space_id");
  CREATE INDEX "calendar_entries_owner_idx" ON "calendar_entries" USING btree ("owner_id");
  CREATE UNIQUE INDEX "calendar_entries_canonical_path_idx" ON "calendar_entries" USING btree ("canonical_path");
  CREATE INDEX "calendar_entries_updated_at_idx" ON "calendar_entries" USING btree ("updated_at");
  CREATE INDEX "calendar_entries_created_at_idx" ON "calendar_entries" USING btree ("created_at");
  CREATE INDEX "calendar_entries_rels_order_idx" ON "calendar_entries_rels" USING btree ("order");
  CREATE INDEX "calendar_entries_rels_parent_idx" ON "calendar_entries_rels" USING btree ("parent_id");
  CREATE INDEX "calendar_entries_rels_path_idx" ON "calendar_entries_rels" USING btree ("path");
  CREATE INDEX "calendar_entries_rels_content_id_idx" ON "calendar_entries_rels" USING btree ("content_id");
  CREATE INDEX "calendar_entries_rels_publications_id_idx" ON "calendar_entries_rels" USING btree ("publications_id");
  CREATE INDEX "calendar_entries_rels_media_assets_id_idx" ON "calendar_entries_rels" USING btree ("media_assets_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_brands_fk" FOREIGN KEY ("brands_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_profiles_fk" FOREIGN KEY ("profiles_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_spaces_fk" FOREIGN KEY ("spaces_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_relationships_fk" FOREIGN KEY ("relationships_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_series_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_taxonomy_redirects_fk" FOREIGN KEY ("taxonomy_redirects_id") REFERENCES "public"."taxonomy_redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_usages_fk" FOREIGN KEY ("media_usages_id") REFERENCES "public"."media_usages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_forum_sections_fk" FOREIGN KEY ("forum_sections_id") REFERENCES "public"."forum_sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_forums_fk" FOREIGN KEY ("forums_id") REFERENCES "public"."forums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discussions_fk" FOREIGN KEY ("discussions_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discussion_posts_fk" FOREIGN KEY ("discussion_posts_id") REFERENCES "public"."discussion_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_calendar_entries_fk" FOREIGN KEY ("calendar_entries_id") REFERENCES "public"."calendar_entries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_brands_id_idx" ON "payload_locked_documents_rels" USING btree ("brands_id");
  CREATE INDEX "payload_locked_documents_rels_members_id_idx" ON "payload_locked_documents_rels" USING btree ("members_id");
  CREATE INDEX "payload_locked_documents_rels_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("profiles_id");
  CREATE INDEX "payload_locked_documents_rels_spaces_id_idx" ON "payload_locked_documents_rels" USING btree ("spaces_id");
  CREATE INDEX "payload_locked_documents_rels_authors_id_idx" ON "payload_locked_documents_rels" USING btree ("authors_id");
  CREATE INDEX "payload_locked_documents_rels_publications_id_idx" ON "payload_locked_documents_rels" USING btree ("publications_id");
  CREATE INDEX "payload_locked_documents_rels_relationships_id_idx" ON "payload_locked_documents_rels" USING btree ("relationships_id");
  CREATE INDEX "payload_locked_documents_rels_media_assets_id_idx" ON "payload_locked_documents_rels" USING btree ("media_assets_id");
  CREATE INDEX "payload_locked_documents_rels_sections_id_idx" ON "payload_locked_documents_rels" USING btree ("sections_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("topics_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_series_id_idx" ON "payload_locked_documents_rels" USING btree ("series_id");
  CREATE INDEX "payload_locked_documents_rels_taxonomy_redirects_id_idx" ON "payload_locked_documents_rels" USING btree ("taxonomy_redirects_id");
  CREATE INDEX "payload_locked_documents_rels_content_id_idx" ON "payload_locked_documents_rels" USING btree ("content_id");
  CREATE INDEX "payload_locked_documents_rels_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("sources_id");
  CREATE INDEX "payload_locked_documents_rels_albums_id_idx" ON "payload_locked_documents_rels" USING btree ("albums_id");
  CREATE INDEX "payload_locked_documents_rels_media_usages_id_idx" ON "payload_locked_documents_rels" USING btree ("media_usages_id");
  CREATE INDEX "payload_locked_documents_rels_forum_sections_id_idx" ON "payload_locked_documents_rels" USING btree ("forum_sections_id");
  CREATE INDEX "payload_locked_documents_rels_forums_id_idx" ON "payload_locked_documents_rels" USING btree ("forums_id");
  CREATE INDEX "payload_locked_documents_rels_discussions_id_idx" ON "payload_locked_documents_rels" USING btree ("discussions_id");
  CREATE INDEX "payload_locked_documents_rels_discussion_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("discussion_posts_id");
  CREATE INDEX "payload_locked_documents_rels_calendar_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("calendar_entries_id");
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Refusing to roll back canonical_information_architecture automatically: the generated down migration would drop canonical content tables and reconstruct auth/session schema from an obsolete snapshot. Restore from backup or write a reviewed, environment-specific rollback instead.',
  )
}

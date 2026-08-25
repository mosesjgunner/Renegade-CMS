import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_books_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_books_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_book_editions_format" AS ENUM('hardcover', 'paperback', 'ebook', 'audiobook');
  CREATE TYPE "public"."enum_podcast_shows_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_podcast_shows_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_podcast_episodes_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_podcast_episodes_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_video_channels_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_video_channels_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_video_playlists_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_video_playlists_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_videos_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_videos_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_interviews_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_interviews_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_livestreams_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_livestreams_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_transcript_revisions_source" AS ENUM('provider', 'manual', 'ai-cleanup');
  CREATE TYPE "public"."enum_media_jobs_kind" AS ENUM('upload', 'import', 'derivative', 'transcribe', 'tts', 'publisher-read');
  CREATE TYPE "public"."enum_media_jobs_status" AS ENUM('queued', 'running', 'cancelled', 'retrying', 'failed', 'completed');
  CREATE TYPE "public"."enum_tts_outputs_mode" AS ENUM('tts', 'publisher-read');
  CREATE TYPE "public"."enum_tts_outputs_status" AS ENUM('processing', 'ready', 'failed');
  CREATE TYPE "public"."enum_media_derivatives_preset" AS ENUM('hero', 'og', 'square', 'portrait', 'story', 'newsletter', 'thumbnail');
  CREATE TYPE "public"."enum_media_derivatives_status" AS ENUM('pending', 'approved', 'superseded', 'failed');
  CREATE TYPE "public"."enum_edit_sessions_status" AS ENUM('active', 'cancelled', 'committed');
  CREATE TYPE "public"."enum_quick_capture_drafts_offline_state" AS ENUM('queued', 'synced', 'conflict');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'media-import';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'media-render';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'media-transcribe';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'media-tts';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'media-import';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'media-render';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'media-transcribe';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'media-tts';
  CREATE TABLE "books" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_books_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_books_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"isbn" varchar,
  	"purchase_links" jsonb,
  	"download_links" jsonb,
  	"cover_id" uuid,
  	"serialized_release" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "books_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_assets_id" uuid
  );
  
  CREATE TABLE "book_parts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"book_id" uuid NOT NULL,
  	"title" varchar NOT NULL,
  	"display_order" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "book_chapters" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"book_id" uuid NOT NULL,
  	"part_id" uuid,
  	"content_id" uuid,
  	"title" varchar NOT NULL,
  	"display_order" numeric NOT NULL,
  	"release_at" timestamp(3) with time zone,
  	"preview" boolean DEFAULT false,
  	"footnotes" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "book_editions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"book_id" uuid NOT NULL,
  	"title" varchar NOT NULL,
  	"isbn" varchar,
  	"format" "enum_book_editions_format",
  	"published_at" timestamp(3) with time zone,
  	"download_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "podcast_shows" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_podcast_shows_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_podcast_shows_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"rss_enabled" boolean DEFAULT false,
  	"external_feed_url" varchar,
  	"artwork_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "podcast_shows_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" uuid
  );
  
  CREATE TABLE "podcast_seasons" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"show_id" uuid NOT NULL,
  	"title" varchar NOT NULL,
  	"number" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "podcast_episodes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_podcast_episodes_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_podcast_episodes_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"show_id" uuid NOT NULL,
  	"season_id" uuid,
  	"audio_id" uuid,
  	"external_url" varchar,
  	"provider_identity" varchar,
  	"episode_number" numeric,
  	"show_notes" jsonb,
  	"chapters" jsonb,
  	"transcript_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "podcast_episodes_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" uuid
  );
  
  CREATE TABLE "video_channels" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_video_channels_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_video_channels_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"provider" varchar NOT NULL,
  	"external_id" varchar NOT NULL,
  	"last_synced_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "video_playlists" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_video_playlists_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_video_playlists_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"channel_id" uuid NOT NULL,
  	"external_id" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "videos" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_videos_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_videos_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"channel_id" uuid,
  	"playlist_id" uuid,
  	"provider" varchar NOT NULL,
  	"external_id" varchar NOT NULL,
  	"embed_url" varchar,
  	"thumbnail_id" uuid,
  	"transcript_id" uuid,
  	"chapters" jsonb,
  	"derives_from_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "interviews" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_interviews_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_interviews_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"media_id" uuid,
  	"transcript_id" uuid,
  	"quotes" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "interviews_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" uuid,
  	"sources_id" uuid
  );
  
  CREATE TABLE "livestreams" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_livestreams_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_livestreams_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"starts_at" timestamp(3) with time zone,
  	"embed_url" varchar,
  	"reminder_hook" jsonb,
  	"replay_id" uuid,
  	"transcript_id" uuid,
  	"campaign_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "transcript_revisions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"media_id" uuid NOT NULL,
  	"version" numeric NOT NULL,
  	"source" "enum_transcript_revisions_source" NOT NULL,
  	"source_revision_id" uuid,
  	"segments" jsonb NOT NULL,
  	"checksum" varchar NOT NULL,
  	"immutable" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media_jobs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"kind" "enum_media_jobs_kind" NOT NULL,
  	"status" "enum_media_jobs_status" DEFAULT 'queued' NOT NULL,
  	"progress" numeric DEFAULT 0,
  	"idempotency_key" varchar NOT NULL,
  	"failure" jsonb,
  	"input" jsonb,
  	"output" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tts_outputs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"content_id" uuid NOT NULL,
  	"source_revision_id" uuid,
  	"mode" "enum_tts_outputs_mode" NOT NULL,
  	"audio_id" uuid,
  	"voice_settings" jsonb,
  	"licensed_output_metadata" jsonb,
  	"status" "enum_tts_outputs_status" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "graphic_documents" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"source_media_id" uuid NOT NULL,
  	"source_revision" varchar NOT NULL,
  	"layers" jsonb NOT NULL,
  	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"brand_kit_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media_derivatives" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"document_id" uuid NOT NULL,
  	"source_media_id" uuid NOT NULL,
  	"asset_id" uuid,
  	"preset" "enum_media_derivatives_preset",
  	"recipe" jsonb NOT NULL,
  	"status" "enum_media_derivatives_status" DEFAULT 'pending',
  	"usage_references" jsonb DEFAULT '[]'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "edit_sessions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"document_id" uuid NOT NULL,
  	"status" "enum_edit_sessions_status" DEFAULT 'active',
  	"client_mutation_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quick_capture_drafts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"content_id" uuid,
  	"client_mutation_id" varchar NOT NULL,
  	"offline_state" "enum_quick_capture_drafts_offline_state" DEFAULT 'queued',
  	"requested_review_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quick_capture_drafts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_assets_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "books_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "book_parts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "book_chapters_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "book_editions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "podcast_shows_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "podcast_seasons_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "podcast_episodes_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "video_channels_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "video_playlists_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "videos_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "interviews_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "livestreams_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "transcript_revisions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_jobs_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tts_outputs_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "graphic_documents_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_derivatives_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "edit_sessions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quick_capture_drafts_id" uuid;
  ALTER TABLE "books" ADD CONSTRAINT "books_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books_rels" ADD CONSTRAINT "books_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "books_rels" ADD CONSTRAINT "books_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "book_parts" ADD CONSTRAINT "book_parts_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "book_chapters" ADD CONSTRAINT "book_chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "book_chapters" ADD CONSTRAINT "book_chapters_part_id_book_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."book_parts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "book_chapters" ADD CONSTRAINT "book_chapters_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_download_id_media_assets_id_fk" FOREIGN KEY ("download_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_artwork_id_media_assets_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows_rels" ADD CONSTRAINT "podcast_shows_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."podcast_shows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcast_shows_rels" ADD CONSTRAINT "podcast_shows_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcast_seasons" ADD CONSTRAINT "podcast_seasons_show_id_podcast_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_show_id_podcast_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_season_id_podcast_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."podcast_seasons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_audio_id_media_assets_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_transcript_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes_rels" ADD CONSTRAINT "podcast_episodes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcast_episodes_rels" ADD CONSTRAINT "podcast_episodes_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_channel_id_video_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."video_channels"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_channel_id_video_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."video_channels"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_playlist_id_video_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."video_playlists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_thumbnail_id_media_assets_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_transcript_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_derives_from_id_videos_id_fk" FOREIGN KEY ("derives_from_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_transcript_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews_rels" ADD CONSTRAINT "interviews_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "interviews_rels" ADD CONSTRAINT "interviews_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "interviews_rels" ADD CONSTRAINT "interviews_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_replay_id_videos_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_transcript_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_campaign_id_content_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_revisions" ADD CONSTRAINT "transcript_revisions_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_revisions" ADD CONSTRAINT "transcript_revisions_source_revision_id_transcript_revisions_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tts_outputs" ADD CONSTRAINT "tts_outputs_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tts_outputs" ADD CONSTRAINT "tts_outputs_source_revision_id_revision_records_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tts_outputs" ADD CONSTRAINT "tts_outputs_audio_id_media_assets_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_source_media_id_media_assets_id_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_brand_kit_id_brands_id_fk" FOREIGN KEY ("brand_kit_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_document_id_graphic_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."graphic_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_source_media_id_media_assets_id_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "edit_sessions" ADD CONSTRAINT "edit_sessions_document_id_graphic_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."graphic_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quick_capture_drafts" ADD CONSTRAINT "quick_capture_drafts_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quick_capture_drafts_rels" ADD CONSTRAINT "quick_capture_drafts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."quick_capture_drafts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quick_capture_drafts_rels" ADD CONSTRAINT "quick_capture_drafts_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "books_site_idx" ON "books" USING btree ("site_id");
  CREATE INDEX "books_publication_idx" ON "books" USING btree ("publication_id");
  CREATE INDEX "books_space_idx" ON "books" USING btree ("space_id");
  CREATE INDEX "books_owner_idx" ON "books" USING btree ("owner_id");
  CREATE INDEX "books_content_idx" ON "books" USING btree ("content_id");
  CREATE INDEX "books_cover_idx" ON "books" USING btree ("cover_id");
  CREATE INDEX "books_updated_at_idx" ON "books" USING btree ("updated_at");
  CREATE INDEX "books_created_at_idx" ON "books" USING btree ("created_at");
  CREATE INDEX "books_rels_order_idx" ON "books_rels" USING btree ("order");
  CREATE INDEX "books_rels_parent_idx" ON "books_rels" USING btree ("parent_id");
  CREATE INDEX "books_rels_path_idx" ON "books_rels" USING btree ("path");
  CREATE INDEX "books_rels_media_assets_id_idx" ON "books_rels" USING btree ("media_assets_id");
  CREATE INDEX "book_parts_book_idx" ON "book_parts" USING btree ("book_id");
  CREATE INDEX "book_parts_updated_at_idx" ON "book_parts" USING btree ("updated_at");
  CREATE INDEX "book_parts_created_at_idx" ON "book_parts" USING btree ("created_at");
  CREATE INDEX "book_chapters_book_idx" ON "book_chapters" USING btree ("book_id");
  CREATE INDEX "book_chapters_part_idx" ON "book_chapters" USING btree ("part_id");
  CREATE INDEX "book_chapters_content_idx" ON "book_chapters" USING btree ("content_id");
  CREATE INDEX "book_chapters_updated_at_idx" ON "book_chapters" USING btree ("updated_at");
  CREATE INDEX "book_chapters_created_at_idx" ON "book_chapters" USING btree ("created_at");
  CREATE INDEX "book_editions_book_idx" ON "book_editions" USING btree ("book_id");
  CREATE INDEX "book_editions_download_idx" ON "book_editions" USING btree ("download_id");
  CREATE INDEX "book_editions_updated_at_idx" ON "book_editions" USING btree ("updated_at");
  CREATE INDEX "book_editions_created_at_idx" ON "book_editions" USING btree ("created_at");
  CREATE INDEX "podcast_shows_site_idx" ON "podcast_shows" USING btree ("site_id");
  CREATE INDEX "podcast_shows_publication_idx" ON "podcast_shows" USING btree ("publication_id");
  CREATE INDEX "podcast_shows_space_idx" ON "podcast_shows" USING btree ("space_id");
  CREATE INDEX "podcast_shows_owner_idx" ON "podcast_shows" USING btree ("owner_id");
  CREATE INDEX "podcast_shows_content_idx" ON "podcast_shows" USING btree ("content_id");
  CREATE INDEX "podcast_shows_artwork_idx" ON "podcast_shows" USING btree ("artwork_id");
  CREATE INDEX "podcast_shows_updated_at_idx" ON "podcast_shows" USING btree ("updated_at");
  CREATE INDEX "podcast_shows_created_at_idx" ON "podcast_shows" USING btree ("created_at");
  CREATE INDEX "podcast_shows_rels_order_idx" ON "podcast_shows_rels" USING btree ("order");
  CREATE INDEX "podcast_shows_rels_parent_idx" ON "podcast_shows_rels" USING btree ("parent_id");
  CREATE INDEX "podcast_shows_rels_path_idx" ON "podcast_shows_rels" USING btree ("path");
  CREATE INDEX "podcast_shows_rels_authors_id_idx" ON "podcast_shows_rels" USING btree ("authors_id");
  CREATE INDEX "podcast_seasons_show_idx" ON "podcast_seasons" USING btree ("show_id");
  CREATE INDEX "podcast_seasons_updated_at_idx" ON "podcast_seasons" USING btree ("updated_at");
  CREATE INDEX "podcast_seasons_created_at_idx" ON "podcast_seasons" USING btree ("created_at");
  CREATE INDEX "podcast_episodes_site_idx" ON "podcast_episodes" USING btree ("site_id");
  CREATE INDEX "podcast_episodes_publication_idx" ON "podcast_episodes" USING btree ("publication_id");
  CREATE INDEX "podcast_episodes_space_idx" ON "podcast_episodes" USING btree ("space_id");
  CREATE INDEX "podcast_episodes_owner_idx" ON "podcast_episodes" USING btree ("owner_id");
  CREATE INDEX "podcast_episodes_content_idx" ON "podcast_episodes" USING btree ("content_id");
  CREATE INDEX "podcast_episodes_show_idx" ON "podcast_episodes" USING btree ("show_id");
  CREATE INDEX "podcast_episodes_season_idx" ON "podcast_episodes" USING btree ("season_id");
  CREATE INDEX "podcast_episodes_audio_idx" ON "podcast_episodes" USING btree ("audio_id");
  CREATE UNIQUE INDEX "podcast_episodes_provider_identity_idx" ON "podcast_episodes" USING btree ("provider_identity");
  CREATE INDEX "podcast_episodes_transcript_idx" ON "podcast_episodes" USING btree ("transcript_id");
  CREATE INDEX "podcast_episodes_updated_at_idx" ON "podcast_episodes" USING btree ("updated_at");
  CREATE INDEX "podcast_episodes_created_at_idx" ON "podcast_episodes" USING btree ("created_at");
  CREATE INDEX "podcast_episodes_rels_order_idx" ON "podcast_episodes_rels" USING btree ("order");
  CREATE INDEX "podcast_episodes_rels_parent_idx" ON "podcast_episodes_rels" USING btree ("parent_id");
  CREATE INDEX "podcast_episodes_rels_path_idx" ON "podcast_episodes_rels" USING btree ("path");
  CREATE INDEX "podcast_episodes_rels_authors_id_idx" ON "podcast_episodes_rels" USING btree ("authors_id");
  CREATE INDEX "video_channels_site_idx" ON "video_channels" USING btree ("site_id");
  CREATE INDEX "video_channels_publication_idx" ON "video_channels" USING btree ("publication_id");
  CREATE INDEX "video_channels_space_idx" ON "video_channels" USING btree ("space_id");
  CREATE INDEX "video_channels_owner_idx" ON "video_channels" USING btree ("owner_id");
  CREATE INDEX "video_channels_content_idx" ON "video_channels" USING btree ("content_id");
  CREATE INDEX "video_channels_updated_at_idx" ON "video_channels" USING btree ("updated_at");
  CREATE INDEX "video_channels_created_at_idx" ON "video_channels" USING btree ("created_at");
  CREATE INDEX "video_playlists_site_idx" ON "video_playlists" USING btree ("site_id");
  CREATE INDEX "video_playlists_publication_idx" ON "video_playlists" USING btree ("publication_id");
  CREATE INDEX "video_playlists_space_idx" ON "video_playlists" USING btree ("space_id");
  CREATE INDEX "video_playlists_owner_idx" ON "video_playlists" USING btree ("owner_id");
  CREATE INDEX "video_playlists_content_idx" ON "video_playlists" USING btree ("content_id");
  CREATE INDEX "video_playlists_channel_idx" ON "video_playlists" USING btree ("channel_id");
  CREATE INDEX "video_playlists_updated_at_idx" ON "video_playlists" USING btree ("updated_at");
  CREATE INDEX "video_playlists_created_at_idx" ON "video_playlists" USING btree ("created_at");
  CREATE INDEX "videos_site_idx" ON "videos" USING btree ("site_id");
  CREATE INDEX "videos_publication_idx" ON "videos" USING btree ("publication_id");
  CREATE INDEX "videos_space_idx" ON "videos" USING btree ("space_id");
  CREATE INDEX "videos_owner_idx" ON "videos" USING btree ("owner_id");
  CREATE INDEX "videos_content_idx" ON "videos" USING btree ("content_id");
  CREATE INDEX "videos_channel_idx" ON "videos" USING btree ("channel_id");
  CREATE INDEX "videos_playlist_idx" ON "videos" USING btree ("playlist_id");
  CREATE INDEX "videos_thumbnail_idx" ON "videos" USING btree ("thumbnail_id");
  CREATE INDEX "videos_transcript_idx" ON "videos" USING btree ("transcript_id");
  CREATE INDEX "videos_derives_from_idx" ON "videos" USING btree ("derives_from_id");
  CREATE INDEX "videos_updated_at_idx" ON "videos" USING btree ("updated_at");
  CREATE INDEX "videos_created_at_idx" ON "videos" USING btree ("created_at");
  CREATE INDEX "interviews_site_idx" ON "interviews" USING btree ("site_id");
  CREATE INDEX "interviews_publication_idx" ON "interviews" USING btree ("publication_id");
  CREATE INDEX "interviews_space_idx" ON "interviews" USING btree ("space_id");
  CREATE INDEX "interviews_owner_idx" ON "interviews" USING btree ("owner_id");
  CREATE INDEX "interviews_content_idx" ON "interviews" USING btree ("content_id");
  CREATE INDEX "interviews_media_idx" ON "interviews" USING btree ("media_id");
  CREATE INDEX "interviews_transcript_idx" ON "interviews" USING btree ("transcript_id");
  CREATE INDEX "interviews_updated_at_idx" ON "interviews" USING btree ("updated_at");
  CREATE INDEX "interviews_created_at_idx" ON "interviews" USING btree ("created_at");
  CREATE INDEX "interviews_rels_order_idx" ON "interviews_rels" USING btree ("order");
  CREATE INDEX "interviews_rels_parent_idx" ON "interviews_rels" USING btree ("parent_id");
  CREATE INDEX "interviews_rels_path_idx" ON "interviews_rels" USING btree ("path");
  CREATE INDEX "interviews_rels_authors_id_idx" ON "interviews_rels" USING btree ("authors_id");
  CREATE INDEX "interviews_rels_sources_id_idx" ON "interviews_rels" USING btree ("sources_id");
  CREATE INDEX "livestreams_site_idx" ON "livestreams" USING btree ("site_id");
  CREATE INDEX "livestreams_publication_idx" ON "livestreams" USING btree ("publication_id");
  CREATE INDEX "livestreams_space_idx" ON "livestreams" USING btree ("space_id");
  CREATE INDEX "livestreams_owner_idx" ON "livestreams" USING btree ("owner_id");
  CREATE INDEX "livestreams_content_idx" ON "livestreams" USING btree ("content_id");
  CREATE INDEX "livestreams_replay_idx" ON "livestreams" USING btree ("replay_id");
  CREATE INDEX "livestreams_transcript_idx" ON "livestreams" USING btree ("transcript_id");
  CREATE INDEX "livestreams_campaign_idx" ON "livestreams" USING btree ("campaign_id");
  CREATE INDEX "livestreams_updated_at_idx" ON "livestreams" USING btree ("updated_at");
  CREATE INDEX "livestreams_created_at_idx" ON "livestreams" USING btree ("created_at");
  CREATE INDEX "transcript_revisions_media_idx" ON "transcript_revisions" USING btree ("media_id");
  CREATE INDEX "transcript_revisions_source_revision_idx" ON "transcript_revisions" USING btree ("source_revision_id");
  CREATE INDEX "transcript_revisions_updated_at_idx" ON "transcript_revisions" USING btree ("updated_at");
  CREATE INDEX "transcript_revisions_created_at_idx" ON "transcript_revisions" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_jobs_idempotency_key_idx" ON "media_jobs" USING btree ("idempotency_key");
  CREATE INDEX "media_jobs_updated_at_idx" ON "media_jobs" USING btree ("updated_at");
  CREATE INDEX "media_jobs_created_at_idx" ON "media_jobs" USING btree ("created_at");
  CREATE INDEX "tts_outputs_content_idx" ON "tts_outputs" USING btree ("content_id");
  CREATE INDEX "tts_outputs_source_revision_idx" ON "tts_outputs" USING btree ("source_revision_id");
  CREATE INDEX "tts_outputs_audio_idx" ON "tts_outputs" USING btree ("audio_id");
  CREATE INDEX "tts_outputs_updated_at_idx" ON "tts_outputs" USING btree ("updated_at");
  CREATE INDEX "tts_outputs_created_at_idx" ON "tts_outputs" USING btree ("created_at");
  CREATE INDEX "graphic_documents_source_media_idx" ON "graphic_documents" USING btree ("source_media_id");
  CREATE INDEX "graphic_documents_brand_kit_idx" ON "graphic_documents" USING btree ("brand_kit_id");
  CREATE INDEX "graphic_documents_updated_at_idx" ON "graphic_documents" USING btree ("updated_at");
  CREATE INDEX "graphic_documents_created_at_idx" ON "graphic_documents" USING btree ("created_at");
  CREATE INDEX "media_derivatives_document_idx" ON "media_derivatives" USING btree ("document_id");
  CREATE INDEX "media_derivatives_source_media_idx" ON "media_derivatives" USING btree ("source_media_id");
  CREATE INDEX "media_derivatives_asset_idx" ON "media_derivatives" USING btree ("asset_id");
  CREATE INDEX "media_derivatives_updated_at_idx" ON "media_derivatives" USING btree ("updated_at");
  CREATE INDEX "media_derivatives_created_at_idx" ON "media_derivatives" USING btree ("created_at");
  CREATE INDEX "edit_sessions_document_idx" ON "edit_sessions" USING btree ("document_id");
  CREATE INDEX "edit_sessions_updated_at_idx" ON "edit_sessions" USING btree ("updated_at");
  CREATE INDEX "edit_sessions_created_at_idx" ON "edit_sessions" USING btree ("created_at");
  CREATE INDEX "quick_capture_drafts_content_idx" ON "quick_capture_drafts" USING btree ("content_id");
  CREATE UNIQUE INDEX "quick_capture_drafts_client_mutation_id_idx" ON "quick_capture_drafts" USING btree ("client_mutation_id");
  CREATE INDEX "quick_capture_drafts_updated_at_idx" ON "quick_capture_drafts" USING btree ("updated_at");
  CREATE INDEX "quick_capture_drafts_created_at_idx" ON "quick_capture_drafts" USING btree ("created_at");
  CREATE INDEX "quick_capture_drafts_rels_order_idx" ON "quick_capture_drafts_rels" USING btree ("order");
  CREATE INDEX "quick_capture_drafts_rels_parent_idx" ON "quick_capture_drafts_rels" USING btree ("parent_id");
  CREATE INDEX "quick_capture_drafts_rels_path_idx" ON "quick_capture_drafts_rels" USING btree ("path");
  CREATE INDEX "quick_capture_drafts_rels_media_assets_id_idx" ON "quick_capture_drafts_rels" USING btree ("media_assets_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_books_fk" FOREIGN KEY ("books_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_book_parts_fk" FOREIGN KEY ("book_parts_id") REFERENCES "public"."book_parts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_book_chapters_fk" FOREIGN KEY ("book_chapters_id") REFERENCES "public"."book_chapters"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_book_editions_fk" FOREIGN KEY ("book_editions_id") REFERENCES "public"."book_editions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_podcast_shows_fk" FOREIGN KEY ("podcast_shows_id") REFERENCES "public"."podcast_shows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_podcast_seasons_fk" FOREIGN KEY ("podcast_seasons_id") REFERENCES "public"."podcast_seasons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_podcast_episodes_fk" FOREIGN KEY ("podcast_episodes_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_video_channels_fk" FOREIGN KEY ("video_channels_id") REFERENCES "public"."video_channels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_video_playlists_fk" FOREIGN KEY ("video_playlists_id") REFERENCES "public"."video_playlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_interviews_fk" FOREIGN KEY ("interviews_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_livestreams_fk" FOREIGN KEY ("livestreams_id") REFERENCES "public"."livestreams"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_transcript_revisions_fk" FOREIGN KEY ("transcript_revisions_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_jobs_fk" FOREIGN KEY ("media_jobs_id") REFERENCES "public"."media_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tts_outputs_fk" FOREIGN KEY ("tts_outputs_id") REFERENCES "public"."tts_outputs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_graphic_documents_fk" FOREIGN KEY ("graphic_documents_id") REFERENCES "public"."graphic_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_derivatives_fk" FOREIGN KEY ("media_derivatives_id") REFERENCES "public"."media_derivatives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_edit_sessions_fk" FOREIGN KEY ("edit_sessions_id") REFERENCES "public"."edit_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quick_capture_drafts_fk" FOREIGN KEY ("quick_capture_drafts_id") REFERENCES "public"."quick_capture_drafts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_books_id_idx" ON "payload_locked_documents_rels" USING btree ("books_id");
  CREATE INDEX "payload_locked_documents_rels_book_parts_id_idx" ON "payload_locked_documents_rels" USING btree ("book_parts_id");
  CREATE INDEX "payload_locked_documents_rels_book_chapters_id_idx" ON "payload_locked_documents_rels" USING btree ("book_chapters_id");
  CREATE INDEX "payload_locked_documents_rels_book_editions_id_idx" ON "payload_locked_documents_rels" USING btree ("book_editions_id");
  CREATE INDEX "payload_locked_documents_rels_podcast_shows_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_shows_id");
  CREATE INDEX "payload_locked_documents_rels_podcast_seasons_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_seasons_id");
  CREATE INDEX "payload_locked_documents_rels_podcast_episodes_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_episodes_id");
  CREATE INDEX "payload_locked_documents_rels_video_channels_id_idx" ON "payload_locked_documents_rels" USING btree ("video_channels_id");
  CREATE INDEX "payload_locked_documents_rels_video_playlists_id_idx" ON "payload_locked_documents_rels" USING btree ("video_playlists_id");
  CREATE INDEX "payload_locked_documents_rels_videos_id_idx" ON "payload_locked_documents_rels" USING btree ("videos_id");
  CREATE INDEX "payload_locked_documents_rels_interviews_id_idx" ON "payload_locked_documents_rels" USING btree ("interviews_id");
  CREATE INDEX "payload_locked_documents_rels_livestreams_id_idx" ON "payload_locked_documents_rels" USING btree ("livestreams_id");
  CREATE INDEX "payload_locked_documents_rels_transcript_revisions_id_idx" ON "payload_locked_documents_rels" USING btree ("transcript_revisions_id");
  CREATE INDEX "payload_locked_documents_rels_media_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("media_jobs_id");
  CREATE INDEX "payload_locked_documents_rels_tts_outputs_id_idx" ON "payload_locked_documents_rels" USING btree ("tts_outputs_id");
  CREATE INDEX "payload_locked_documents_rels_graphic_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("graphic_documents_id");
  CREATE INDEX "payload_locked_documents_rels_media_derivatives_id_idx" ON "payload_locked_documents_rels" USING btree ("media_derivatives_id");
  CREATE INDEX "payload_locked_documents_rels_edit_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("edit_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_quick_capture_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("quick_capture_drafts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "books" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "books_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "book_parts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "book_chapters" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "book_editions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "podcast_shows" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "podcast_shows_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "podcast_seasons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "podcast_episodes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "podcast_episodes_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "video_channels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "video_playlists" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "videos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "interviews" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "interviews_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "livestreams" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "transcript_revisions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media_jobs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tts_outputs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "graphic_documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media_derivatives" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "edit_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quick_capture_drafts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quick_capture_drafts_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "books" CASCADE;
  DROP TABLE "books_rels" CASCADE;
  DROP TABLE "book_parts" CASCADE;
  DROP TABLE "book_chapters" CASCADE;
  DROP TABLE "book_editions" CASCADE;
  DROP TABLE "podcast_shows" CASCADE;
  DROP TABLE "podcast_shows_rels" CASCADE;
  DROP TABLE "podcast_seasons" CASCADE;
  DROP TABLE "podcast_episodes" CASCADE;
  DROP TABLE "podcast_episodes_rels" CASCADE;
  DROP TABLE "video_channels" CASCADE;
  DROP TABLE "video_playlists" CASCADE;
  DROP TABLE "videos" CASCADE;
  DROP TABLE "interviews" CASCADE;
  DROP TABLE "interviews_rels" CASCADE;
  DROP TABLE "livestreams" CASCADE;
  DROP TABLE "transcript_revisions" CASCADE;
  DROP TABLE "media_jobs" CASCADE;
  DROP TABLE "tts_outputs" CASCADE;
  DROP TABLE "graphic_documents" CASCADE;
  DROP TABLE "media_derivatives" CASCADE;
  DROP TABLE "edit_sessions" CASCADE;
  DROP TABLE "quick_capture_drafts" CASCADE;
  DROP TABLE "quick_capture_drafts_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_books_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_book_parts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_book_chapters_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_book_editions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_podcast_shows_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_podcast_seasons_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_podcast_episodes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_video_channels_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_video_playlists_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_videos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_interviews_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_livestreams_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_transcript_revisions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_jobs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tts_outputs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_graphic_documents_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_derivatives_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_edit_sessions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quick_capture_drafts_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_books_id_idx";
  DROP INDEX "payload_locked_documents_rels_book_parts_id_idx";
  DROP INDEX "payload_locked_documents_rels_book_chapters_id_idx";
  DROP INDEX "payload_locked_documents_rels_book_editions_id_idx";
  DROP INDEX "payload_locked_documents_rels_podcast_shows_id_idx";
  DROP INDEX "payload_locked_documents_rels_podcast_seasons_id_idx";
  DROP INDEX "payload_locked_documents_rels_podcast_episodes_id_idx";
  DROP INDEX "payload_locked_documents_rels_video_channels_id_idx";
  DROP INDEX "payload_locked_documents_rels_video_playlists_id_idx";
  DROP INDEX "payload_locked_documents_rels_videos_id_idx";
  DROP INDEX "payload_locked_documents_rels_interviews_id_idx";
  DROP INDEX "payload_locked_documents_rels_livestreams_id_idx";
  DROP INDEX "payload_locked_documents_rels_transcript_revisions_id_idx";
  DROP INDEX "payload_locked_documents_rels_media_jobs_id_idx";
  DROP INDEX "payload_locked_documents_rels_tts_outputs_id_idx";
  DROP INDEX "payload_locked_documents_rels_graphic_documents_id_idx";
  DROP INDEX "payload_locked_documents_rels_media_derivatives_id_idx";
  DROP INDEX "payload_locked_documents_rels_edit_sessions_id_idx";
  DROP INDEX "payload_locked_documents_rels_quick_capture_drafts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "books_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "book_parts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "book_chapters_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "book_editions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "podcast_shows_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "podcast_seasons_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "podcast_episodes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "video_channels_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "video_playlists_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "videos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "interviews_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "livestreams_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "transcript_revisions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_jobs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tts_outputs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "graphic_documents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_derivatives_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "edit_sessions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quick_capture_drafts_id";
  DROP TYPE "public"."enum_books_structured_data_mode";
  DROP TYPE "public"."enum_books_structured_data_source_collection";
  DROP TYPE "public"."enum_book_editions_format";
  DROP TYPE "public"."enum_podcast_shows_structured_data_mode";
  DROP TYPE "public"."enum_podcast_shows_structured_data_source_collection";
  DROP TYPE "public"."enum_podcast_episodes_structured_data_mode";
  DROP TYPE "public"."enum_podcast_episodes_structured_data_source_collection";
  DROP TYPE "public"."enum_video_channels_structured_data_mode";
  DROP TYPE "public"."enum_video_channels_structured_data_source_collection";
  DROP TYPE "public"."enum_video_playlists_structured_data_mode";
  DROP TYPE "public"."enum_video_playlists_structured_data_source_collection";
  DROP TYPE "public"."enum_videos_structured_data_mode";
  DROP TYPE "public"."enum_videos_structured_data_source_collection";
  DROP TYPE "public"."enum_interviews_structured_data_mode";
  DROP TYPE "public"."enum_interviews_structured_data_source_collection";
  DROP TYPE "public"."enum_livestreams_structured_data_mode";
  DROP TYPE "public"."enum_livestreams_structured_data_source_collection";
  DROP TYPE "public"."enum_transcript_revisions_source";
  DROP TYPE "public"."enum_media_jobs_kind";
  DROP TYPE "public"."enum_media_jobs_status";
  DROP TYPE "public"."enum_tts_outputs_mode";
  DROP TYPE "public"."enum_tts_outputs_status";
  DROP TYPE "public"."enum_media_derivatives_preset";
  DROP TYPE "public"."enum_media_derivatives_status";
  DROP TYPE "public"."enum_edit_sessions_status";
  DROP TYPE "public"."enum_quick_capture_drafts_offline_state";`)
}

import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "content"
      ADD COLUMN IF NOT EXISTS "seo_title" varchar,
      ADD COLUMN IF NOT EXISTS "seo_description" varchar,
      ADD COLUMN IF NOT EXISTS "seo_canonical_url" varchar,
      ADD COLUMN IF NOT EXISTS "seo_image_alt" varchar,
      ADD COLUMN IF NOT EXISTS "seo_keywords" jsonb,
      ADD COLUMN IF NOT EXISTS "seo_focus_keyphrase" varchar,
      ADD COLUMN IF NOT EXISTS "seo_no_index" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "structured_data_mode" varchar DEFAULT 'none' NOT NULL,
      ADD COLUMN IF NOT EXISTS "structured_data_primary_type" varchar,
      ADD COLUMN IF NOT EXISTS "structured_data_source_collection" varchar,
      ADD COLUMN IF NOT EXISTS "structured_data_source_identifier" varchar,
      ADD COLUMN IF NOT EXISTS "structured_data_manual" jsonb,
      ADD COLUMN IF NOT EXISTS "structured_data_version" numeric DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "knowledge_graph_projection_status" varchar DEFAULT 'disabled' NOT NULL,
      ADD COLUMN IF NOT EXISTS "knowledge_graph_node_key" varchar,
      ADD COLUMN IF NOT EXISTS "knowledge_graph_projection_boundary" jsonb,
      ADD COLUMN IF NOT EXISTS "import_source_system" varchar,
      ADD COLUMN IF NOT EXISTS "import_source_identifier" varchar,
      ADD COLUMN IF NOT EXISTS "import_source_checksum" varchar,
      ADD COLUMN IF NOT EXISTS "export_format_version" numeric DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "export_ownership" jsonb;

    CREATE TABLE IF NOT EXISTS "events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "owner_id" uuid,
      "title" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "canonical_path" varchar NOT NULL,
      "summary" varchar,
      "status" varchar DEFAULT 'draft' NOT NULL,
      "all_day" boolean DEFAULT false,
      "starts_at" timestamp(3) with time zone NOT NULL,
      "ends_at" timestamp(3) with time zone,
      "time_zone" varchar DEFAULT 'UTC' NOT NULL,
      "visibility" varchar DEFAULT 'public' NOT NULL,
      "venue_name" varchar,
      "venue_region" varchar,
      "attendance_mode" varchar DEFAULT 'in-person' NOT NULL,
      "hero_media_id" uuid,
      "calendar_entry_id" uuid,
      "audience" jsonb,
      "seo_title" varchar,
      "seo_description" varchar,
      "seo_canonical_url" varchar,
      "seo_image_alt" varchar,
      "seo_keywords" jsonb,
      "seo_focus_keyphrase" varchar,
      "seo_no_index" boolean DEFAULT false,
      "structured_data_mode" varchar DEFAULT 'none' NOT NULL,
      "structured_data_primary_type" varchar,
      "structured_data_source_collection" varchar,
      "structured_data_source_identifier" varchar,
      "structured_data_manual" jsonb,
      "structured_data_version" numeric DEFAULT 1,
      "knowledge_graph_projection_status" varchar DEFAULT 'disabled' NOT NULL,
      "knowledge_graph_node_key" varchar,
      "knowledge_graph_projection_boundary" jsonb,
      "import_source_system" varchar,
      "import_source_identifier" varchar,
      "import_source_checksum" varchar,
      "export_format_version" numeric DEFAULT 1,
      "export_ownership" jsonb,
      "public_render_strategy" varchar DEFAULT 'default' NOT NULL,
      "public_render_variant" varchar,
      "public_render_context" jsonb,
      "event_card_variant" varchar,
      "event_list_variant" varchar,
      "timeline_embed_variant" varchar,
      "timeline_block_variant" varchar,
      "retention_mode" varchar DEFAULT 'permanent' NOT NULL,
      "retention_expires_at" timestamp(3) with time zone,
      "retention_hold" varchar DEFAULT 'none' NOT NULL,
      "remove_from_discovery" boolean DEFAULT true,
      "tombstone_label" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "timelines" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "owner_id" uuid,
      "title" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "canonical_path" varchar NOT NULL,
      "summary" varchar,
      "status" varchar DEFAULT 'draft' NOT NULL,
      "visibility" varchar DEFAULT 'public' NOT NULL,
      "ordering_mode" varchar DEFAULT 'chronological' NOT NULL,
      "hero_media_id" uuid,
      "postgres_query_scope" jsonb,
      "seo_title" varchar,
      "seo_description" varchar,
      "seo_canonical_url" varchar,
      "seo_image_alt" varchar,
      "seo_keywords" jsonb,
      "seo_focus_keyphrase" varchar,
      "seo_no_index" boolean DEFAULT false,
      "structured_data_mode" varchar DEFAULT 'none' NOT NULL,
      "structured_data_primary_type" varchar,
      "structured_data_source_collection" varchar,
      "structured_data_source_identifier" varchar,
      "structured_data_manual" jsonb,
      "structured_data_version" numeric DEFAULT 1,
      "knowledge_graph_projection_status" varchar DEFAULT 'disabled' NOT NULL,
      "knowledge_graph_node_key" varchar,
      "knowledge_graph_projection_boundary" jsonb,
      "import_source_system" varchar,
      "import_source_identifier" varchar,
      "import_source_checksum" varchar,
      "export_format_version" numeric DEFAULT 1,
      "export_ownership" jsonb,
      "public_render_strategy" varchar DEFAULT 'default' NOT NULL,
      "public_render_variant" varchar,
      "public_render_context" jsonb,
      "event_card_variant" varchar,
      "event_list_variant" varchar,
      "timeline_embed_variant" varchar,
      "timeline_block_variant" varchar,
      "retention_mode" varchar DEFAULT 'permanent' NOT NULL,
      "retention_expires_at" timestamp(3) with time zone,
      "retention_hold" varchar DEFAULT 'none' NOT NULL,
      "remove_from_discovery" boolean DEFAULT true,
      "tombstone_label" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "timeline_memberships" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "timeline_id" uuid NOT NULL,
      "event_id" uuid NOT NULL,
      "membership_key" varchar NOT NULL,
      "display_title" varchar,
      "display_summary" varchar,
      "era_label" varchar,
      "position" numeric DEFAULT 0,
      "display_starts_at" timestamp(3) with time zone,
      "display_ends_at" timestamp(3) with time zone,
      "render_variant" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "calendar_entries"
      ADD COLUMN IF NOT EXISTS "event_id" uuid;

    ALTER TABLE "calendar_entries_rels"
      ADD COLUMN IF NOT EXISTS "events_id" uuid;

    ALTER TABLE "media_usages_rels"
      ADD COLUMN IF NOT EXISTS "events_id" uuid,
      ADD COLUMN IF NOT EXISTS "timelines_id" uuid;

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "events_id" uuid,
      ADD COLUMN IF NOT EXISTS "timelines_id" uuid,
      ADD COLUMN IF NOT EXISTS "timeline_memberships_id" uuid;

    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_hero_media_id_media_assets_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_calendar_entry_id_calendar_entries_id_fk" FOREIGN KEY ("calendar_entry_id") REFERENCES "public"."calendar_entries"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE "timelines" ADD CONSTRAINT "timelines_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "timelines" ADD CONSTRAINT "timelines_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "timelines" ADD CONSTRAINT "timelines_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "timelines" ADD CONSTRAINT "timelines_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "timelines" ADD CONSTRAINT "timelines_hero_media_id_media_assets_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE "timeline_memberships" ADD CONSTRAINT "timeline_memberships_timeline_id_timelines_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "public"."timelines"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "timeline_memberships" ADD CONSTRAINT "timeline_memberships_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "calendar_entries_rels" ADD CONSTRAINT "calendar_entries_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_timelines_fk" FOREIGN KEY ("timelines_id") REFERENCES "public"."timelines"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_timelines_fk" FOREIGN KEY ("timelines_id") REFERENCES "public"."timelines"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_timeline_memberships_fk" FOREIGN KEY ("timeline_memberships_id") REFERENCES "public"."timeline_memberships"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS "events_canonical_path_idx" ON "events" USING btree ("canonical_path");
    CREATE UNIQUE INDEX IF NOT EXISTS "events_publication_slug_idx" ON "events" USING btree ("publication_id", "slug");
    CREATE INDEX IF NOT EXISTS "events_site_idx" ON "events" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "events_publication_idx" ON "events" USING btree ("publication_id");
    CREATE INDEX IF NOT EXISTS "events_space_idx" ON "events" USING btree ("space_id");
    CREATE INDEX IF NOT EXISTS "events_owner_idx" ON "events" USING btree ("owner_id");
    CREATE INDEX IF NOT EXISTS "events_calendar_entry_idx" ON "events" USING btree ("calendar_entry_id");
    CREATE INDEX IF NOT EXISTS "events_updated_at_idx" ON "events" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "events_created_at_idx" ON "events" USING btree ("created_at");

    CREATE UNIQUE INDEX IF NOT EXISTS "timelines_canonical_path_idx" ON "timelines" USING btree ("canonical_path");
    CREATE UNIQUE INDEX IF NOT EXISTS "timelines_publication_slug_idx" ON "timelines" USING btree ("publication_id", "slug");
    CREATE INDEX IF NOT EXISTS "timelines_site_idx" ON "timelines" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "timelines_publication_idx" ON "timelines" USING btree ("publication_id");
    CREATE INDEX IF NOT EXISTS "timelines_space_idx" ON "timelines" USING btree ("space_id");
    CREATE INDEX IF NOT EXISTS "timelines_owner_idx" ON "timelines" USING btree ("owner_id");
    CREATE INDEX IF NOT EXISTS "timelines_updated_at_idx" ON "timelines" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "timelines_created_at_idx" ON "timelines" USING btree ("created_at");

    CREATE UNIQUE INDEX IF NOT EXISTS "timeline_memberships_membership_key_idx" ON "timeline_memberships" USING btree ("membership_key");
    CREATE INDEX IF NOT EXISTS "timeline_memberships_timeline_idx" ON "timeline_memberships" USING btree ("timeline_id");
    CREATE INDEX IF NOT EXISTS "timeline_memberships_event_idx" ON "timeline_memberships" USING btree ("event_id");
    CREATE INDEX IF NOT EXISTS "timeline_memberships_position_idx" ON "timeline_memberships" USING btree ("position");
    CREATE INDEX IF NOT EXISTS "timeline_memberships_updated_at_idx" ON "timeline_memberships" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "timeline_memberships_created_at_idx" ON "timeline_memberships" USING btree ("created_at");

    CREATE INDEX IF NOT EXISTS "calendar_entries_event_idx" ON "calendar_entries" USING btree ("event_id");
    CREATE INDEX IF NOT EXISTS "calendar_entries_rels_events_id_idx" ON "calendar_entries_rels" USING btree ("events_id");
    CREATE INDEX IF NOT EXISTS "media_usages_rels_events_id_idx" ON "media_usages_rels" USING btree ("events_id");
    CREATE INDEX IF NOT EXISTS "media_usages_rels_timelines_id_idx" ON "media_usages_rels" USING btree ("timelines_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_timelines_id_idx" ON "payload_locked_documents_rels" USING btree ("timelines_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_timeline_memberships_id_idx" ON "payload_locked_documents_rels" USING btree ("timeline_memberships_id");
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Refusing to roll back event_timeline_reconciliation automatically: the migration is additive, but safe rollback requires a reviewed plan for seeded Event/Timeline data and retained relation records.',
  )
}

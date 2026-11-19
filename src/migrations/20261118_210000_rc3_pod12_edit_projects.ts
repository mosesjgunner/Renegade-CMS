import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-12 (POD-REQ-26, POD-REQ-27): EDL edit projects.
 *
 * One new table, `podcast_edit_projects`: one row per edit project
 * (site/show relations; optional session/recording/episode relations
 * carried from the POD-09 recording the project was created from; the
 * project document as jsonb in `project_data` — the POD-00 EDL plus
 * the bounded in-document autosave version history). The table gains
 * its `payload_locked_documents_rels` column following the standard
 * Payload pattern. Relationship columns are nullable at the DB level
 * with ON DELETE SET NULL, matching every existing Payload table in
 * this schema (required-ness is enforced by Payload validation, not
 * the column).
 *
 * Rollback note: `down` drops exactly what `up` adds. Dropping
 * `podcast_edit_projects` destroys every edit project's EDL and its
 * saved version history (the source recordings, episodes and media
 * assets are separate rows and survive, orphaned of their projects).
 * Export podcast_edit_projects first if a rollback must keep edits.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "podcast_edit_projects" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid,
      "show_id" uuid,
      "session_id" uuid,
      "recording_id" uuid,
      "episode_id" uuid,
      "title" varchar,
      "project_data" jsonb,
      "schema_version" numeric DEFAULT 1,
      "last_saved_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "podcast_edit_projects_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "podcast_edit_projects"
        ADD CONSTRAINT "podcast_edit_projects_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_edit_projects"
        ADD CONSTRAINT "podcast_edit_projects_show_id_podcast_shows_id_fk"
        FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_edit_projects"
        ADD CONSTRAINT "podcast_edit_projects_session_id_podcast_studio_sessions_id_fk"
        FOREIGN KEY ("session_id") REFERENCES "public"."podcast_studio_sessions"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_edit_projects"
        ADD CONSTRAINT "podcast_edit_projects_recording_id_podcast_recordings_id_fk"
        FOREIGN KEY ("recording_id") REFERENCES "public"."podcast_recordings"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_edit_projects"
        ADD CONSTRAINT "podcast_edit_projects_episode_id_podcast_episodes_id_fk"
        FOREIGN KEY ("episode_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_edit_projects_fk"
        FOREIGN KEY ("podcast_edit_projects_id") REFERENCES "public"."podcast_edit_projects"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "podcast_edit_projects_site_idx" ON "podcast_edit_projects" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "podcast_edit_projects_show_idx" ON "podcast_edit_projects" USING btree ("show_id");
    CREATE INDEX IF NOT EXISTS "podcast_edit_projects_session_idx" ON "podcast_edit_projects" USING btree ("session_id");
    CREATE INDEX IF NOT EXISTS "podcast_edit_projects_recording_idx" ON "podcast_edit_projects" USING btree ("recording_id");
    CREATE INDEX IF NOT EXISTS "podcast_edit_projects_episode_idx" ON "podcast_edit_projects" USING btree ("episode_id");
    CREATE INDEX IF NOT EXISTS "podcast_edit_projects_updated_at_idx" ON "podcast_edit_projects" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_edit_projects_created_at_idx" ON "podcast_edit_projects" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_edit_projects_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_edit_projects_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_edit_projects_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_edit_projects_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "podcast_edit_projects_id";
    DROP TABLE IF EXISTS "podcast_edit_projects";
  `)
}

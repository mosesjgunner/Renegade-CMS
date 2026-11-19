import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-05 (POD-REQ-11): Podcast Studio sessions.
 *
 * One new table, `podcast_studio_sessions`: one row per studio
 * session, site-scoped via `site_id` (copied from the owning show at
 * creation) with `show_id` pointing at podcast-shows. The full POD-00
 * StudioSession document is stored as jsonb in `session_data`;
 * `state` mirrors the document's desk state (enum:
 * draft/ready/live/paused/recording/stopped/ended) for cheap listing,
 * `schema_version` records the session schema version (1), and
 * `started_at`/`last_saved_at` stamp the row's lifecycle. The table
 * gains its `payload_locked_documents_rels` column following the
 * standard Payload pattern. Relationship columns are nullable at the
 * DB level with ON DELETE SET NULL, matching every existing Payload
 * table in this schema (required-ness is enforced by Payload
 * validation, not the column).
 *
 * Rollback note: `down` drops exactly what `up` adds. Dropping the
 * table destroys every saved studio session (rundowns, cartwall
 * state, mixer snapshots, session logs) recorded after this
 * migration; export podcast_studio_sessions first if a rollback must
 * keep that state.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_studio_sessions_state" AS ENUM('draft', 'ready', 'live', 'paused', 'recording', 'stopped', 'ended');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE TABLE IF NOT EXISTS "podcast_studio_sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid,
      "show_id" uuid,
      "title" varchar NOT NULL,
      "state" "enum_podcast_studio_sessions_state" DEFAULT 'draft',
      "session_data" jsonb,
      "schema_version" numeric DEFAULT 1,
      "started_at" timestamp(3) with time zone,
      "last_saved_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "podcast_studio_sessions_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "podcast_studio_sessions"
        ADD CONSTRAINT "podcast_studio_sessions_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_studio_sessions"
        ADD CONSTRAINT "podcast_studio_sessions_show_id_podcast_shows_id_fk"
        FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_studio_sessions_fk"
        FOREIGN KEY ("podcast_studio_sessions_id") REFERENCES "public"."podcast_studio_sessions"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "podcast_studio_sessions_site_idx" ON "podcast_studio_sessions" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "podcast_studio_sessions_show_idx" ON "podcast_studio_sessions" USING btree ("show_id");
    CREATE INDEX IF NOT EXISTS "podcast_studio_sessions_updated_at_idx" ON "podcast_studio_sessions" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_studio_sessions_created_at_idx" ON "podcast_studio_sessions" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_studio_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_studio_sessions_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_studio_sessions_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_studio_sessions_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "podcast_studio_sessions_id";
    DROP TABLE IF EXISTS "podcast_studio_sessions";
    DROP TYPE IF EXISTS "public"."enum_podcast_studio_sessions_state";
  `)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-14 (POD-REQ-30, POD-REQ-31): post-production intelligence.
 *
 * - New table `podcast_assist_drafts`: one row per generated assist
 *   draft (kind enum chapters/show-notes/summary/highlight/audiogram,
 *   state enum draft/accepted/discarded, payload jsonb, createdBy)
 *   attached to a podcast episode (show/site relations nullable at
 *   the DB level with ON DELETE SET NULL, matching the schema-wide
 *   Payload convention; required-ness is Payload-level). Plus its
 *   `payload_locked_documents_rels` column.
 * - `transcript_revisions` gain `review_state` (enum draft/reviewed,
 *   nullable): provider-generated revisions land as drafts and are
 *   only served once accepted/linked; pre-POD-14 rows keep NULL and
 *   are treated as reviewed.
 * - The `podcast-transcribe` task slug is added to Payload's
 *   `enum_payload_jobs_task_slug` and `enum_payload_jobs_log_task_slug`
 *   (both enums bake registered task slugs; queueing fails without
 *   them — the POD-02 lesson).
 *
 * Rollback note: `down` drops exactly what `up` adds. Dropping
 * `podcast_assist_drafts` destroys un-accepted draft history
 * (accepted drafts' effects already live on their episodes);
 * dropping `review_state` discards the draft/reviewed distinction
 * (draft revisions become indistinguishable from reviewed ones —
 * export first if that matters). The task-slug enum values cannot
 * be removed by Postgres and stay, inert.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_assist_drafts_kind" AS ENUM('chapters', 'show-notes', 'summary', 'highlight', 'audiogram');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_assist_drafts_state" AS ENUM('draft', 'accepted', 'discarded');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_transcript_revisions_review_state" AS ENUM('draft', 'reviewed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE TABLE IF NOT EXISTS "podcast_assist_drafts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "title" varchar NOT NULL,
      "episode_id" uuid,
      "show_id" uuid,
      "site_id" uuid,
      "kind" "enum_podcast_assist_drafts_kind",
      "state" "enum_podcast_assist_drafts_state" DEFAULT 'draft',
      "payload" jsonb,
      "created_by" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "podcast_assist_drafts_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "podcast_assist_drafts"
        ADD CONSTRAINT "podcast_assist_drafts_episode_id_podcast_episodes_id_fk"
        FOREIGN KEY ("episode_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_assist_drafts"
        ADD CONSTRAINT "podcast_assist_drafts_show_id_podcast_shows_id_fk"
        FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_assist_drafts"
        ADD CONSTRAINT "podcast_assist_drafts_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_assist_drafts_fk"
        FOREIGN KEY ("podcast_assist_drafts_id") REFERENCES "public"."podcast_assist_drafts"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "podcast_assist_drafts_episode_idx" ON "podcast_assist_drafts" USING btree ("episode_id");
    CREATE INDEX IF NOT EXISTS "podcast_assist_drafts_show_idx" ON "podcast_assist_drafts" USING btree ("show_id");
    CREATE INDEX IF NOT EXISTS "podcast_assist_drafts_site_idx" ON "podcast_assist_drafts" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "podcast_assist_drafts_updated_at_idx" ON "podcast_assist_drafts" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_assist_drafts_created_at_idx" ON "podcast_assist_drafts" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_assist_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_assist_drafts_id");
    ALTER TABLE "transcript_revisions"
      ADD COLUMN IF NOT EXISTS "review_state" "enum_transcript_revisions_review_state";
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'podcast-transcribe';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'podcast-transcribe';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_assist_drafts_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_assist_drafts_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "podcast_assist_drafts_id";
    DROP TABLE IF EXISTS "podcast_assist_drafts";
    DROP TYPE IF EXISTS "public"."enum_podcast_assist_drafts_kind";
    DROP TYPE IF EXISTS "public"."enum_podcast_assist_drafts_state";
    ALTER TABLE "transcript_revisions"
      DROP COLUMN IF EXISTS "review_state";
    DROP TYPE IF EXISTS "public"."enum_transcript_revisions_review_state";
  `)
}

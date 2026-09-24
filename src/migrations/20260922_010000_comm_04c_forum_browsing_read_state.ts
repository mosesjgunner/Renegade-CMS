import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-04C: denormalized topic browse summaries and per-member read cursors. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "forum_topics"
      ADD COLUMN IF NOT EXISTS "view_count" integer NOT NULL DEFAULT 0 CHECK ("view_count" >= 0),
      ADD COLUMN IF NOT EXISTS "reply_count" integer NOT NULL DEFAULT 0 CHECK ("reply_count" >= 0),
      ADD COLUMN IF NOT EXISTS "last_post_author_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "last_post_timestamp" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "last_post_sequence_number" integer NOT NULL DEFAULT 0 CHECK ("last_post_sequence_number" >= 0);

    WITH latest_post AS (
      SELECT DISTINCT ON (fp.topic_id)
        fp.topic_id, fp.author_id, fp.created_at, fp.sequence_number,
        COUNT(*) OVER (PARTITION BY fp.topic_id)::integer AS count
      FROM "forum_posts" fp
      ORDER BY fp.topic_id, fp.sequence_number DESC
    )
    UPDATE "forum_topics" t SET
      "reply_count" = GREATEST(COALESCE(p.count, 0) - 1, 0),
      "last_post_author_id" = p.author_id,
      "last_post_timestamp" = p.created_at,
      "last_post_sequence_number" = COALESCE(p.sequence_number, 0)
    FROM latest_post p
    WHERE p.topic_id = t.id;

    CREATE TABLE IF NOT EXISTS "member_topic_read_state" (
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "topic_id" uuid NOT NULL REFERENCES "forum_topics"("id") ON DELETE CASCADE,
      "last_read_sequence_number" integer NOT NULL DEFAULT 0 CHECK ("last_read_sequence_number" >= 0),
      "read_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY ("member_id", "topic_id")
    );
    CREATE INDEX IF NOT EXISTS "member_topic_read_state_member_topic_idx"
      ON "member_topic_read_state" ("member_id", "topic_id", "last_read_sequence_number");
    CREATE INDEX IF NOT EXISTS "forum_topics_space_last_activity_idx"
      ON "forum_topics" ("space_id", "last_post_timestamp" DESC, "id" DESC);
    CREATE INDEX IF NOT EXISTS "forum_topics_space_creation_idx"
      ON "forum_topics" ("space_id", "created_at" DESC, "id" DESC);
    CREATE INDEX IF NOT EXISTS "forum_topics_space_reply_count_idx"
      ON "forum_topics" ("space_id", "reply_count" DESC, "id" DESC);

    CREATE OR REPLACE FUNCTION "project_forum_topic_summary"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE "forum_topics" SET
        "reply_count" = GREATEST("next_post_sequence" - 2, 0),
        "last_post_author_id" = NEW.author_id,
        "last_post_timestamp" = NEW.created_at,
        "last_post_sequence_number" = NEW.sequence_number,
        "updated_at" = now()
      WHERE id = NEW.topic_id AND "last_post_sequence_number" < NEW.sequence_number;
      RETURN NEW;
    END; $$;
    DROP TRIGGER IF EXISTS "forum_posts_summary_projection" ON "forum_posts";
    CREATE TRIGGER "forum_posts_summary_projection" AFTER INSERT ON "forum_posts"
      FOR EACH ROW EXECUTE FUNCTION "project_forum_topic_summary"();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS "forum_posts_summary_projection" ON "forum_posts";
    DROP FUNCTION IF EXISTS "project_forum_topic_summary"();
    DROP TABLE IF EXISTS "member_topic_read_state";
    DROP INDEX IF EXISTS "forum_topics_space_reply_count_idx";
    DROP INDEX IF EXISTS "forum_topics_space_creation_idx";
    DROP INDEX IF EXISTS "forum_topics_space_last_activity_idx";
    ALTER TABLE "forum_topics"
      DROP COLUMN IF EXISTS "last_post_sequence_number",
      DROP COLUMN IF EXISTS "last_post_timestamp",
      DROP COLUMN IF EXISTS "last_post_author_id",
      DROP COLUMN IF EXISTS "reply_count",
      DROP COLUMN IF EXISTS "view_count";
  `)
}

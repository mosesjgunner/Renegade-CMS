import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-04B: transactional forum topics, ordered posts, and private drafts. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "forum_topics" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid NOT NULL REFERENCES "forum_spaces"("id") ON DELETE CASCADE,
      "author_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "title" varchar(256) NOT NULL,
      "is_locked" boolean NOT NULL DEFAULT false,
      "next_post_sequence" integer NOT NULL DEFAULT 1 CHECK ("next_post_sequence" >= 1),
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "forum_topics_space_updated_idx" ON "forum_topics" ("space_id", "updated_at" DESC);

    CREATE TABLE IF NOT EXISTS "forum_posts" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "topic_id" uuid NOT NULL REFERENCES "forum_topics"("id") ON DELETE CASCADE,
      "author_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "sequence_number" integer NOT NULL CHECK ("sequence_number" >= 1),
      "reply_to_post_id" uuid REFERENCES "forum_posts"("id") ON DELETE RESTRICT,
      "body_raw" text NOT NULL,
      "body_html" text NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "forum_posts_topic_sequence_unique" UNIQUE ("topic_id", "sequence_number"),
      CONSTRAINT "forum_posts_reply_not_self" CHECK ("reply_to_post_id" IS NULL OR "reply_to_post_id" <> "id")
    );
    CREATE INDEX IF NOT EXISTS "forum_posts_topic_sequence_idx" ON "forum_posts" ("topic_id", "sequence_number");
    CREATE INDEX IF NOT EXISTS "forum_posts_reply_to_idx" ON "forum_posts" ("reply_to_post_id");

    CREATE TABLE IF NOT EXISTS "forum_drafts" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid NOT NULL REFERENCES "forum_spaces"("id") ON DELETE CASCADE,
      "topic_id" uuid REFERENCES "forum_topics"("id") ON DELETE CASCADE,
      "author_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "title" varchar(256),
      "body_raw" text NOT NULL DEFAULT '',
      "reply_to_post_id" uuid REFERENCES "forum_posts"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "forum_drafts_author_target_unique" UNIQUE NULLS NOT DISTINCT ("author_id", "topic_id", "space_id")
    );

    CREATE OR REPLACE FUNCTION "validate_forum_topic_space_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM forum_spaces WHERE id = NEW.space_id AND site_id = NEW.site_id) THEN
        RAISE EXCEPTION 'forum topic space must belong to its site' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE OR REPLACE FUNCTION "validate_forum_post_reply"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.reply_to_post_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM forum_posts WHERE id = NEW.reply_to_post_id AND topic_id = NEW.topic_id
      ) THEN RAISE EXCEPTION 'quoted post must belong to the same topic' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END; $$;
    CREATE OR REPLACE FUNCTION "forum_post_immutable_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.author_id <> OLD.author_id OR NEW.created_at <> OLD.created_at
         OR NEW.topic_id <> OLD.topic_id OR NEW.sequence_number <> OLD.sequence_number
         OR NEW.reply_to_post_id IS DISTINCT FROM OLD.reply_to_post_id THEN
        RAISE EXCEPTION 'forum post identity and quote reference are immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END; $$;
    DROP TRIGGER IF EXISTS "forum_topics_space_scope" ON "forum_topics";
    CREATE TRIGGER "forum_topics_space_scope" BEFORE INSERT OR UPDATE OF site_id, space_id ON "forum_topics"
      FOR EACH ROW EXECUTE FUNCTION "validate_forum_topic_space_scope"();
    DROP TRIGGER IF EXISTS "forum_posts_reply_scope" ON "forum_posts";
    CREATE TRIGGER "forum_posts_reply_scope" BEFORE INSERT OR UPDATE OF topic_id, reply_to_post_id ON "forum_posts"
      FOR EACH ROW EXECUTE FUNCTION "validate_forum_post_reply"();
    DROP TRIGGER IF EXISTS "forum_posts_immutable_identity" ON "forum_posts";
    CREATE TRIGGER "forum_posts_immutable_identity" BEFORE UPDATE ON "forum_posts"
      FOR EACH ROW EXECUTE FUNCTION "forum_post_immutable_identity"();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "forum_drafts";
    DROP TRIGGER IF EXISTS "forum_posts_immutable_identity" ON "forum_posts";
    DROP TRIGGER IF EXISTS "forum_posts_reply_scope" ON "forum_posts";
    DROP TABLE IF EXISTS "forum_posts";
    DROP TRIGGER IF EXISTS "forum_topics_space_scope" ON "forum_topics";
    DROP TABLE IF EXISTS "forum_topics";
    DROP FUNCTION IF EXISTS "forum_post_immutable_identity"();
    DROP FUNCTION IF EXISTS "validate_forum_post_reply"();
    DROP FUNCTION IF EXISTS "validate_forum_topic_space_scope"();
  `)
}

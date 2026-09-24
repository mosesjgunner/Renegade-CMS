import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-04D: staff topic lifecycle, durable redirects/audit, and search-sync outbox keys. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS forum_topics_space_pinned_idx ON forum_topics (space_id, is_pinned DESC, last_post_timestamp DESC);
    CREATE TABLE IF NOT EXISTS forum_topic_redirects (
      id uuid PRIMARY KEY DEFAULT renegade_uuid_v7(), site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      source_topic_id uuid NOT NULL REFERENCES forum_topics(id) ON DELETE RESTRICT,
      target_topic_id uuid NOT NULL REFERENCES forum_topics(id) ON DELETE RESTRICT,
      created_by_member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      created_at timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT forum_topic_redirects_source_unique UNIQUE (source_topic_id),
      -- A move retains the topic identity, but records its former space as an immutable route alias.
      source_space_id uuid REFERENCES forum_spaces(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS forum_merge_audit (
      id uuid PRIMARY KEY DEFAULT renegade_uuid_v7(), site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      operation varchar(16) NOT NULL CHECK (operation IN ('move','merge','split','pin','lock','archive')),
      source_topic_id uuid NOT NULL REFERENCES forum_topics(id) ON DELETE RESTRICT,
      target_topic_id uuid REFERENCES forum_topics(id) ON DELETE RESTRICT,
      post_ids jsonb NOT NULL DEFAULT '[]'::jsonb, details jsonb NOT NULL DEFAULT '{}'::jsonb,
      actor_member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      created_at timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS forum_merge_audit_source_idx ON forum_merge_audit (source_topic_id, created_at DESC);
    ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS idempotency_key varchar(256);
    CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_idempotency_key_unique ON outbox_events (idempotency_key) WHERE idempotency_key IS NOT NULL;
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS acl_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

    CREATE OR REPLACE FUNCTION forum_post_immutable_identity() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.author_id <> OLD.author_id OR NEW.created_at <> OLD.created_at
         OR NEW.reply_to_post_id IS DISTINCT FROM OLD.reply_to_post_id THEN
        RAISE EXCEPTION 'forum post identity and quote reference are immutable' USING ERRCODE = '23514';
      END IF;
      IF (NEW.topic_id <> OLD.topic_id OR NEW.sequence_number <> OLD.sequence_number)
         AND COALESCE(current_setting('renegade.forum_operation', true), '') NOT IN ('merge', 'split') THEN
        RAISE EXCEPTION 'forum post topic and sequence are immutable outside a staff operation' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE OR REPLACE FUNCTION validate_forum_post_reply() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      -- A merge/split moves a complete selected set under the same transaction lock. The final
      -- state is validated by the service's selection predicate; checking each intermediate row
      -- would reject a reply whose parent has not been moved yet.
      IF current_setting('renegade.forum_operation', true) IN ('merge', 'split') THEN RETURN NEW; END IF;
      IF NEW.reply_to_post_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM forum_posts WHERE id = NEW.reply_to_post_id AND topic_id = NEW.topic_id
      ) THEN RAISE EXCEPTION 'quoted post must belong to the same topic' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END; $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE search_documents DROP COLUMN IF EXISTS acl_metadata;
    DROP INDEX IF EXISTS outbox_events_idempotency_key_unique;
    ALTER TABLE outbox_events DROP COLUMN IF EXISTS idempotency_key;
    DROP TABLE IF EXISTS forum_merge_audit;
    DROP TABLE IF EXISTS forum_topic_redirects;
    DROP INDEX IF EXISTS forum_topics_space_pinned_idx;
    ALTER TABLE forum_topics DROP COLUMN IF EXISTS is_archived, DROP COLUMN IF EXISTS is_pinned;
  `)
}

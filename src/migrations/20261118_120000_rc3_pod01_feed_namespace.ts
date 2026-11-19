import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-01 (POD-REQ-01…04): Podcasting 2.0 feed namespace data path.
 *
 * podcast-shows gain the channel-level feed config: the persisted
 * podcast:guid value (generated once, so slug renames never change it),
 * the podcast:locked owner email, the podcast:medium select, and the
 * funding / value / persons JSON configs. podcast-episodes gain the live
 * state that drives podcast:liveItem (liveState + start/end + stream URL)
 * and an optional per-episode persons JSON override.
 *
 * JSON fields are plain jsonb columns here, matching how Payload's own
 * generated migrations add json fields (e.g. the initial schema's jsonb
 * columns) — there is no separate JSON registry to update.
 *
 * Rollback note: `down` drops exactly the columns and enum types `up`
 * adds. Dropping the columns discards any funding/value/persons config,
 * live state, and persisted podcast GUIDs stored after this migration —
 * export podcast-shows / podcast-episodes first if a rollback must keep
 * that data. A show whose persisted GUID is dropped and later re-created
 * gets a GUID recomputed from its then-current feed URL, which may differ
 * from the GUID directories already know.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_shows_medium" AS ENUM('podcast', 'podcastL', 'podcastM', 'music', 'musicL', 'video', 'videoL', 'film', 'filmL', 'audiobook', 'audiobookL', 'newsletter', 'newsletterL', 'blog', 'blogL');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_episodes_live_state" AS ENUM('none', 'scheduled', 'live', 'ended');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    ALTER TABLE "podcast_shows"
      ADD COLUMN IF NOT EXISTS "podcast_guid_value" varchar,
      ADD COLUMN IF NOT EXISTS "locked_owner_email" varchar,
      ADD COLUMN IF NOT EXISTS "medium" "enum_podcast_shows_medium" DEFAULT 'podcast',
      ADD COLUMN IF NOT EXISTS "funding" jsonb,
      ADD COLUMN IF NOT EXISTS "value" jsonb,
      ADD COLUMN IF NOT EXISTS "persons" jsonb;
    ALTER TABLE "podcast_episodes"
      ADD COLUMN IF NOT EXISTS "live_state" "enum_podcast_episodes_live_state" DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS "live_start_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "live_end_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "live_stream_url" varchar,
      ADD COLUMN IF NOT EXISTS "persons" jsonb;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_episodes"
      DROP COLUMN IF EXISTS "persons",
      DROP COLUMN IF EXISTS "live_stream_url",
      DROP COLUMN IF EXISTS "live_end_at",
      DROP COLUMN IF EXISTS "live_start_at",
      DROP COLUMN IF EXISTS "live_state";
    ALTER TABLE "podcast_shows"
      DROP COLUMN IF EXISTS "persons",
      DROP COLUMN IF EXISTS "value",
      DROP COLUMN IF EXISTS "funding",
      DROP COLUMN IF EXISTS "medium",
      DROP COLUMN IF EXISTS "locked_owner_email",
      DROP COLUMN IF EXISTS "podcast_guid_value";
    DROP TYPE IF EXISTS "public"."enum_podcast_episodes_live_state";
    DROP TYPE IF EXISTS "public"."enum_podcast_shows_medium";
  `)
}

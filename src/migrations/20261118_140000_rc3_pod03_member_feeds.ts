import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-03 (POD-REQ-08): private & member podcast feeds.
 *
 * podcast-shows gain `feed_visibility` (public/members, default
 * public) and the optional `required_entitlement` JSON policy — the
 * commerce entitlement binding for member feeds, in the same
 * { resource, capability, scope? } shape content/events already use.
 * podcast-episodes gain `members_only` (members-only episodes are
 * absent from the public feed and served only via token feeds).
 * The new `podcast_feed_tokens` table stores per-member feed tokens
 * as SHA-256 hashes ONLY (the raw token is never persisted), with
 * revocation and last-used stamps; `payload_locked_documents_rels`
 * gains its column following the standard Payload pattern.
 *
 * Rollback note: `down` drops exactly what `up` adds. Dropping
 * `podcast_feed_tokens` destroys every issued member feed token —
 * members would need fresh tokens issued after a re-migrate — and
 * dropping the show/episode columns discards feed-visibility,
 * entitlement-policy, and members-only markings recorded after this
 * migration (shows fall back to public visibility on re-migrate).
 * Export podcast-shows / podcast-episodes / podcast-feed-tokens
 * first if a rollback must keep that state.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_shows_feed_visibility" AS ENUM('public', 'members');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    ALTER TABLE "podcast_shows"
      ADD COLUMN IF NOT EXISTS "feed_visibility" "enum_podcast_shows_feed_visibility" DEFAULT 'public',
      ADD COLUMN IF NOT EXISTS "required_entitlement" jsonb;
    ALTER TABLE "podcast_episodes"
      ADD COLUMN IF NOT EXISTS "members_only" boolean DEFAULT false;
    CREATE TABLE IF NOT EXISTS "podcast_feed_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "member_id" uuid NOT NULL,
      "show_id" uuid NOT NULL,
      "token_hash" varchar NOT NULL,
      "revoked_at" timestamp(3) with time zone,
      "last_used_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "podcast_feed_tokens_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "podcast_feed_tokens"
        ADD CONSTRAINT "podcast_feed_tokens_member_id_members_id_fk"
        FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_feed_tokens"
        ADD CONSTRAINT "podcast_feed_tokens_show_id_podcast_shows_id_fk"
        FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_feed_tokens_fk"
        FOREIGN KEY ("podcast_feed_tokens_id") REFERENCES "public"."podcast_feed_tokens"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "podcast_feed_tokens_member_idx" ON "podcast_feed_tokens" USING btree ("member_id");
    CREATE INDEX IF NOT EXISTS "podcast_feed_tokens_show_idx" ON "podcast_feed_tokens" USING btree ("show_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "podcast_feed_tokens_token_hash_idx" ON "podcast_feed_tokens" USING btree ("token_hash");
    CREATE INDEX IF NOT EXISTS "podcast_feed_tokens_updated_at_idx" ON "podcast_feed_tokens" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_feed_tokens_created_at_idx" ON "podcast_feed_tokens" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_feed_tokens_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_feed_tokens_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_feed_tokens_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_feed_tokens_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "podcast_feed_tokens_id";
    DROP TABLE IF EXISTS "podcast_feed_tokens";
    ALTER TABLE "podcast_episodes"
      DROP COLUMN IF EXISTS "members_only";
    ALTER TABLE "podcast_shows"
      DROP COLUMN IF EXISTS "required_entitlement",
      DROP COLUMN IF EXISTS "feed_visibility";
    DROP TYPE IF EXISTS "public"."enum_podcast_shows_feed_visibility";
  `)
}

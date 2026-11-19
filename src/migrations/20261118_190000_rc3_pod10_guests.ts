import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-10 (POD-REQ-21/22): remote guests.
 *
 * Two new tables:
 * - `podcast_guest_invites`: one row per guest invite — purpose-bound,
 *   session-bound (FK to podcast_studio_sessions), optional guest-book
 *   link, lobby state enum, headphone declaration enum, and ONLY the
 *   SHA-256 hashes of the invite token / signalling credential.
 * - `podcast_signalling_messages`: the durable signalling log the
 *   long-poll endpoints exchange SDP/ICE over (sender + type enums,
 *   payload jsonb).
 *
 * Both tables gain their `payload_locked_documents_rels` columns
 * following the standard Payload pattern. Relationship columns are
 * nullable at the DB level with ON DELETE SET NULL, matching every
 * existing Payload table (required-ness is Payload-enforced).
 *
 * Rollback note: `down` drops exactly what `up` adds. Dropping the
 * tables destroys every outstanding invite and the signalling history
 * recorded after this migration; in-flight guest sessions end.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_guest_invites_state" AS ENUM('invited', 'preflight', 'waiting', 'admitted', 'dropped', 'left');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_guest_invites_headphones" AS ENUM('headphones', 'no-headphones-fallback');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_signalling_messages_sender" AS ENUM('guest', 'host');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_signalling_messages_type" AS ENUM('offer', 'answer', 'ice-candidate', 'bye', 'hello', 'preflight', 'talkback');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE TABLE IF NOT EXISTS "podcast_guest_invites" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "purpose" varchar DEFAULT 'guest-invite' NOT NULL,
      "session_id" uuid,
      "show_id" uuid,
      "site_id" uuid,
      "guest_id" uuid,
      "token_hash" varchar NOT NULL,
      "signalling_token_hash" varchar,
      "state" "enum_podcast_guest_invites_state" DEFAULT 'invited',
      "display_name" varchar,
      "headphones" "enum_podcast_guest_invites_headphones",
      "strip_id" varchar,
      "expires_at" timestamp(3) with time zone,
      "revoked_at" timestamp(3) with time zone,
      "joined_at" timestamp(3) with time zone,
      "admitted_at" timestamp(3) with time zone,
      "drop_reason" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "podcast_signalling_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "session_id" uuid,
      "invite_id" uuid,
      "sender" "enum_podcast_signalling_messages_sender" NOT NULL,
      "type" "enum_podcast_signalling_messages_type" NOT NULL,
      "payload" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "podcast_guest_invites_id" uuid;
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "podcast_signalling_messages_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "podcast_guest_invites"
        ADD CONSTRAINT "podcast_guest_invites_session_id_podcast_studio_sessions_id_fk"
        FOREIGN KEY ("session_id") REFERENCES "public"."podcast_studio_sessions"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_guest_invites"
        ADD CONSTRAINT "podcast_guest_invites_show_id_podcast_shows_id_fk"
        FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_guest_invites"
        ADD CONSTRAINT "podcast_guest_invites_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_guest_invites"
        ADD CONSTRAINT "podcast_guest_invites_guest_id_podcast_guests_id_fk"
        FOREIGN KEY ("guest_id") REFERENCES "public"."podcast_guests"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_signalling_messages"
        ADD CONSTRAINT "podcast_signalling_messages_session_id_podcast_studio_sessions_id_fk"
        FOREIGN KEY ("session_id") REFERENCES "public"."podcast_studio_sessions"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_signalling_messages"
        ADD CONSTRAINT "podcast_signalling_messages_invite_id_podcast_guest_invites_id_fk"
        FOREIGN KEY ("invite_id") REFERENCES "public"."podcast_guest_invites"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_guest_invites_fk"
        FOREIGN KEY ("podcast_guest_invites_id") REFERENCES "public"."podcast_guest_invites"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_signalling_messages_fk"
        FOREIGN KEY ("podcast_signalling_messages_id") REFERENCES "public"."podcast_signalling_messages"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS "podcast_guest_invites_token_hash_idx" ON "podcast_guest_invites" USING btree ("token_hash");
    CREATE INDEX IF NOT EXISTS "podcast_guest_invites_session_idx" ON "podcast_guest_invites" USING btree ("session_id");
    CREATE INDEX IF NOT EXISTS "podcast_guest_invites_show_idx" ON "podcast_guest_invites" USING btree ("show_id");
    CREATE INDEX IF NOT EXISTS "podcast_guest_invites_site_idx" ON "podcast_guest_invites" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "podcast_guest_invites_guest_idx" ON "podcast_guest_invites" USING btree ("guest_id");
    CREATE INDEX IF NOT EXISTS "podcast_guest_invites_signalling_token_hash_idx" ON "podcast_guest_invites" USING btree ("signalling_token_hash");
    CREATE INDEX IF NOT EXISTS "podcast_guest_invites_updated_at_idx" ON "podcast_guest_invites" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_guest_invites_created_at_idx" ON "podcast_guest_invites" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "podcast_signalling_messages_session_idx" ON "podcast_signalling_messages" USING btree ("session_id");
    CREATE INDEX IF NOT EXISTS "podcast_signalling_messages_invite_idx" ON "podcast_signalling_messages" USING btree ("invite_id");
    CREATE INDEX IF NOT EXISTS "podcast_signalling_messages_updated_at_idx" ON "podcast_signalling_messages" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_signalling_messages_created_at_idx" ON "podcast_signalling_messages" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_guest_invites_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_guest_invites_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_signalling_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_signalling_messages_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_guest_invites_fk";
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_signalling_messages_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_guest_invites_id_idx";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_signalling_messages_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "podcast_guest_invites_id";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "podcast_signalling_messages_id";
    DROP TABLE IF EXISTS "podcast_signalling_messages";
    DROP TABLE IF EXISTS "podcast_guest_invites";
    DROP TYPE IF EXISTS "public"."enum_podcast_signalling_messages_type";
    DROP TYPE IF EXISTS "public"."enum_podcast_signalling_messages_sender";
    DROP TYPE IF EXISTS "public"."enum_podcast_guest_invites_headphones";
    DROP TYPE IF EXISTS "public"."enum_podcast_guest_invites_state";
  `)
}

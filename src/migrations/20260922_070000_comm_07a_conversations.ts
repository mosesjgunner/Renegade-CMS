import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-07A: canonical durable conversations.  Plaintext messages are deliberately not E2EE. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "conversations" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "kind" varchar(16) NOT NULL CHECK ("kind" IN ('direct','group')),
      "status" varchar(16) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','archived')),
      "title" varchar(256), "avatar_url" text,
      "direct_member_low_id" uuid REFERENCES "members"("id") ON DELETE RESTRICT,
      "direct_member_high_id" uuid REFERENCES "members"("id") ON DELETE RESTRICT,
      "next_message_sequence" integer NOT NULL DEFAULT 1 CHECK ("next_message_sequence" >= 1),
      "last_message_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "conversations_direct_pair_shape" CHECK ((kind = 'direct' AND direct_member_low_id IS NOT NULL AND direct_member_high_id IS NOT NULL AND direct_member_low_id <> direct_member_high_id) OR (kind = 'group' AND direct_member_low_id IS NULL AND direct_member_high_id IS NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "conversations_active_direct_pair_unique" ON "conversations" ("site_id", "direct_member_low_id", "direct_member_high_id") WHERE "kind" = 'direct' AND "status" = 'active';
    CREATE INDEX IF NOT EXISTS "conversations_site_last_message_idx" ON "conversations" ("site_id", "last_message_at" DESC);
    CREATE TABLE IF NOT EXISTS "conversation_memberships" (
      "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "joined_at" timestamp(3) with time zone NOT NULL DEFAULT now(), "left_at" timestamp(3) with time zone,
      PRIMARY KEY ("conversation_id", "member_id")
    );
    CREATE INDEX IF NOT EXISTS "conversation_memberships_member_active_idx" ON "conversation_memberships" ("member_id", "conversation_id") WHERE "left_at" IS NULL;
    CREATE TABLE IF NOT EXISTS "messages" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
      "sender_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "idempotency_key" varchar(255) NOT NULL,
      "sequence_number" integer NOT NULL CHECK ("sequence_number" >= 1),
      "body_html" text NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "messages_conversation_sequence_unique" UNIQUE ("conversation_id", "sequence_number"),
      CONSTRAINT "messages_conversation_idempotency_unique" UNIQUE ("conversation_id", "idempotency_key")
    );
    CREATE INDEX IF NOT EXISTS "messages_conversation_sequence_idx" ON "messages" ("conversation_id", "sequence_number");
    CREATE OR REPLACE FUNCTION "messages_require_active_membership"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM conversation_memberships WHERE conversation_id = NEW.conversation_id AND member_id = NEW.sender_id AND left_at IS NULL) THEN
        RAISE EXCEPTION 'active conversation membership required' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END; $$;
    DROP TRIGGER IF EXISTS "messages_active_membership" ON "messages";
    CREATE TRIGGER "messages_active_membership" BEFORE INSERT ON "messages" FOR EACH ROW EXECUTE FUNCTION "messages_require_active_membership"();
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS "messages_active_membership" ON "messages";
    DROP FUNCTION IF EXISTS "messages_require_active_membership"();
    DROP TABLE IF EXISTS "messages"; DROP TABLE IF EXISTS "conversation_memberships"; DROP TABLE IF EXISTS "conversations";
  `)
}

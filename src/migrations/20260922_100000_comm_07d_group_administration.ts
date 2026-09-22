import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-07D: durable group roles, retained membership history, and system sequence records. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "conversation_memberships"
      ADD COLUMN IF NOT EXISTS "role" varchar(16) NOT NULL DEFAULT 'member'
        CHECK ("role" IN ('admin','member')),
      ADD COLUMN IF NOT EXISTS "visible_from_sequence" integer NOT NULL DEFAULT 1
        CHECK ("visible_from_sequence" >= 1);
    ALTER TABLE "messages"
      ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL DEFAULT 'member'
        CHECK ("kind" IN ('member','system')),
      ADD COLUMN IF NOT EXISTS "system_event" varchar(48);
    ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;
    ALTER TABLE "messages" ADD CONSTRAINT "messages_system_shape"
      CHECK (("kind" = 'member' AND "sender_id" IS NOT NULL AND "system_event" IS NULL)
        OR ("kind" = 'system' AND "sender_id" IS NULL AND "system_event" IS NOT NULL)) NOT VALID;
    CREATE INDEX IF NOT EXISTS "conversation_memberships_active_group_role_idx"
      ON "conversation_memberships" ("conversation_id", "role") WHERE "left_at" IS NULL;
    CREATE OR REPLACE FUNCTION "messages_require_active_membership"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.kind = 'member' AND NOT EXISTS (SELECT 1 FROM conversation_memberships WHERE conversation_id = NEW.conversation_id AND member_id = NEW.sender_id AND left_at IS NULL) THEN
        RAISE EXCEPTION 'active conversation membership required' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE OR REPLACE FUNCTION "system_messages_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.kind = 'system' THEN
        RAISE EXCEPTION 'system messages are immutable' USING ERRCODE = '55000';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    DROP TRIGGER IF EXISTS "system_messages_immutable_update" ON "messages";
    DROP TRIGGER IF EXISTS "system_messages_immutable_delete" ON "messages";
    CREATE TRIGGER "system_messages_immutable_update" BEFORE UPDATE ON "messages" FOR EACH ROW EXECUTE FUNCTION "system_messages_immutable"();
    CREATE TRIGGER "system_messages_immutable_delete" BEFORE DELETE ON "messages" FOR EACH ROW EXECUTE FUNCTION "system_messages_immutable"();
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "conversation_memberships_active_group_role_idx";
    DROP TRIGGER IF EXISTS "system_messages_immutable_update" ON "messages";
    DROP TRIGGER IF EXISTS "system_messages_immutable_delete" ON "messages";
    DROP FUNCTION IF EXISTS "system_messages_immutable"();
    ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_system_shape";
    ALTER TABLE "messages" DROP COLUMN IF EXISTS "system_event", DROP COLUMN IF EXISTS "kind";
    ALTER TABLE "messages" ALTER COLUMN "sender_id" SET NOT NULL;
    ALTER TABLE "conversation_memberships" DROP COLUMN IF EXISTS "visible_from_sequence", DROP COLUMN IF EXISTS "role";
  `)
}

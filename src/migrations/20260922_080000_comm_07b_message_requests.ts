import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-07B: direct-message request state and durable new-account request limit. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "request_state" varchar(20) NOT NULL DEFAULT 'active' CHECK ("request_state" IN ('pending_request','active','declined'));
    ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "request_recipient_member_id" uuid REFERENCES "members"("id") ON DELETE RESTRICT;
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_request_recipient_shape" CHECK ((request_state='pending_request' AND request_recipient_member_id IS NOT NULL) OR (request_state IN ('active','declined')));
    CREATE TABLE IF NOT EXISTS "message_request_attempts" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "sender_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE, "recipient_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE, "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "message_request_attempts_sender_window_idx" ON "message_request_attempts" ("site_id","sender_id","created_at" DESC);
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> { await db.execute(sql`
  DROP TABLE IF EXISTS "message_request_attempts";
  ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_request_recipient_shape";
  ALTER TABLE "conversations" DROP COLUMN IF EXISTS "request_recipient_member_id";
  ALTER TABLE "conversations" DROP COLUMN IF EXISTS "request_state";
`) }

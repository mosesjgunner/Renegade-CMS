import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-00: Community Domain Reconciled Migration */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 1. Community Reactions table
    CREATE TABLE IF NOT EXISTS "community_reactions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      "member_id" uuid REFERENCES "members"("id") ON DELETE CASCADE,
      "target_type" varchar(32) NOT NULL,
      "target_id" varchar(255) NOT NULL,
      "emoji" varchar(64) NOT NULL,
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_community_reactions_unique" 
      ON "community_reactions" ("site_id", "member_id", "target_type", "target_id", "emoji");
    CREATE INDEX IF NOT EXISTS "idx_community_reactions_target" 
      ON "community_reactions" ("target_type", "target_id");

    -- 2. Community Reports table
    CREATE TABLE IF NOT EXISTS "community_reports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      "reporter_id" uuid REFERENCES "members"("id") ON DELETE CASCADE,
      "target_type" varchar(32) NOT NULL,
      "target_id" varchar(255) NOT NULL,
      "reason" varchar(255) NOT NULL,
      "details" text,
      "status" varchar(32) DEFAULT 'pending' NOT NULL,
      "resolution" text,
      "resolved_by" varchar(255),
      "resolved_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_community_reports_site_status" 
      ON "community_reports" ("site_id", "status");
    CREATE INDEX IF NOT EXISTS "idx_community_reports_target" 
      ON "community_reports" ("target_type", "target_id");

    -- 3. Community Moderation Actions audit table
    CREATE TABLE IF NOT EXISTS "moderation_actions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      "actor" varchar(255) NOT NULL,
      "target_type" varchar(32) NOT NULL,
      "target_id" varchar(255) NOT NULL,
      "action" varchar(32) NOT NULL,
      "reason" text NOT NULL,
      "details" jsonb DEFAULT '{}'::jsonb,
      "occurred_at" timestamp with time zone DEFAULT now(),
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_moderation_actions_target" 
      ON "moderation_actions" ("target_type", "target_id");

    -- 4. Community Conversations table
    CREATE TABLE IF NOT EXISTS "community_conversations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      "title" varchar(255),
      "status" varchar(32) DEFAULT 'active' NOT NULL,
      "last_message_at" timestamp with time zone DEFAULT now(),
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_community_conversations_site" 
      ON "community_conversations" ("site_id", "last_message_at");

    -- 5. Community Conversation Participants table
    CREATE TABLE IF NOT EXISTS "community_conversation_participants" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" uuid REFERENCES "community_conversations"("id") ON DELETE CASCADE,
      "member_id" uuid REFERENCES "members"("id") ON DELETE CASCADE,
      "joined_at" timestamp with time zone DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_community_conv_participants_unique" 
      ON "community_conversation_participants" ("conversation_id", "member_id");
    CREATE INDEX IF NOT EXISTS "idx_community_conv_participants_member" 
      ON "community_conversation_participants" ("member_id");

    -- 6. Community Messages table
    CREATE TABLE IF NOT EXISTS "community_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" uuid REFERENCES "community_conversations"("id") ON DELETE CASCADE,
      "sender_id" uuid REFERENCES "members"("id") ON DELETE CASCADE,
      "body" text NOT NULL,
      "attachments" jsonb DEFAULT '[]'::jsonb,
      "read_by" jsonb DEFAULT '[]'::jsonb,
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_community_messages_conversation" 
      ON "community_messages" ("conversation_id", "created_at");

    -- 7. Ensure team_memberships default id is gen_random_uuid()
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_memberships') THEN
        ALTER TABLE "team_memberships" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "community_messages";
    DROP TABLE IF EXISTS "community_conversation_participants";
    DROP TABLE IF EXISTS "community_conversations";
    DROP TABLE IF EXISTS "moderation_actions";
    DROP TABLE IF EXISTS "community_reports";
    DROP TABLE IF EXISTS "community_reactions";
  `)
}

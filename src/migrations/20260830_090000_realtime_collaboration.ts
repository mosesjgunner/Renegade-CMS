import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "realtime_events" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "sequence" bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
      "kind" varchar NOT NULL,
      "recipient_member_id" uuid,
      "article_id" uuid,
      "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "realtime_events_recipient_sequence_idx" ON "realtime_events" ("recipient_member_id", "sequence");
    CREATE INDEX IF NOT EXISTS "realtime_events_scope_sequence_idx" ON "realtime_events" ("scope_key", "sequence");
    CREATE TABLE IF NOT EXISTS "realtime_presence" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "member_id" uuid NOT NULL,
      "article_id" uuid NOT NULL,
      "client_id" varchar NOT NULL,
      "mode" varchar NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "last_heartbeat_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      UNIQUE ("member_id", "article_id", "client_id")
    );
    CREATE INDEX IF NOT EXISTS "realtime_presence_article_expiry_idx" ON "realtime_presence" ("article_id", "expires_at");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "realtime_events_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "realtime_presence_id" uuid;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    DROP TABLE IF EXISTS "realtime_presence" CASCADE;
    DROP TABLE IF EXISTS "realtime_events" CASCADE;
  `)
}

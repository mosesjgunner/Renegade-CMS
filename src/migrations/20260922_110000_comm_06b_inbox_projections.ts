import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-06B: durable, member-owned inbox projection. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "inbox_notifications" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "recipient_member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "actor_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "source_event_id" uuid REFERENCES "outbox_events"("id") ON DELETE CASCADE,
      "kind" varchar(128) NOT NULL,
      "target_type" varchar(32) NOT NULL,
      "target_id" uuid NOT NULL,
      "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "read_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "inbox_notifications_source_recipient_unique" UNIQUE ("source_event_id", "recipient_member_id")
    );
    CREATE INDEX IF NOT EXISTS "inbox_notifications_member_keyset_idx"
      ON "inbox_notifications" ("recipient_member_id", "site_id", "created_at" DESC, "id" DESC);
    CREATE INDEX IF NOT EXISTS "inbox_notifications_member_unread_idx"
      ON "inbox_notifications" ("recipient_member_id", "site_id") WHERE "read_at" IS NULL;

    CREATE TABLE IF NOT EXISTS "member_notification_counters" (
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "unread_count" integer NOT NULL DEFAULT 0 CHECK ("unread_count" >= 0),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY ("site_id", "member_id")
    );
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "member_notification_counters";
    DROP TABLE IF EXISTS "inbox_notifications";
  `)
}

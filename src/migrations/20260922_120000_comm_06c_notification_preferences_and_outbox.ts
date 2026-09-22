import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-06C: notification preferences, digest windows, and audience delivery outbox. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "notification_preferences" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "channel" varchar(32) NOT NULL DEFAULT 'email',
      "kind" varchar(64) NOT NULL DEFAULT 'all',
      "frequency" varchar(32) NOT NULL DEFAULT 'immediate',
      "rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "notification_preferences_site_member_channel_kind_unique" UNIQUE ("site_id", "member_id", "channel", "kind")
    );
    CREATE INDEX IF NOT EXISTS "notification_preferences_member_idx"
      ON "notification_preferences" ("member_id", "site_id");

    CREATE TABLE IF NOT EXISTS "audience_delivery_outbox" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "recipient_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "channel" varchar(32) NOT NULL,
      "envelope" jsonb NOT NULL,
      "status" varchar(32) NOT NULL DEFAULT 'pending',
      "scheduled_for" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "dispatched_at" timestamp(3) with time zone,
      "error" text
    );
    CREATE INDEX IF NOT EXISTS "audience_delivery_outbox_pending_idx"
      ON "audience_delivery_outbox" ("status", "scheduled_for") WHERE "status" = 'pending';
    CREATE INDEX IF NOT EXISTS "audience_delivery_outbox_recipient_idx"
      ON "audience_delivery_outbox" ("recipient_id", "site_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "audience_delivery_outbox";
    DROP TABLE IF EXISTS "notification_preferences";
  `)
}

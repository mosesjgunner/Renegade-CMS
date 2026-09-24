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

    -- The Payload collection predates COMM-06C and owns this table. Reconcile
    -- its original member-level preferences instead of treating the existing
    -- relation as proof that the delivery fields have already been installed.
    ALTER TABLE "notification_preferences"
      ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS "channel" varchar(32) NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS "kind" varchar(64) NOT NULL DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS "frequency" varchar(32) NOT NULL DEFAULT 'immediate';
  `)

  // Keep the indexes in a subsequent statement. PostgreSQL/Drizzle can plan a
  // multi-statement prepared query against the schema that existed before the
  // table definition above, which makes a fresh install incorrectly report
  // that the new columns do not exist.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "notification_preferences_member_site_idx"
      ON "notification_preferences" ("member_id", "site_id");
  `)

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "notification_preferences"
        ADD CONSTRAINT "notification_preferences_site_member_channel_kind_unique"
        UNIQUE ("site_id", "member_id", "channel", "kind");
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)

  await db.execute(sql`
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

    ALTER TABLE "audience_delivery_outbox"
      ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS "recipient_id" uuid REFERENCES "members"("id") ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS "channel" varchar(32) NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS "envelope" jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS "status" varchar(32) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp(3) with time zone NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "dispatched_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "error" text;
  `)

  await db.execute(sql`
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

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-03D: thread subscriptions and transactional comment-created outbox emission. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "comment_thread_subscriptions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "thread_id" uuid NOT NULL REFERENCES "comment_threads"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "comment_thread_subscriptions_thread_member_unique" UNIQUE ("thread_id", "member_id")
    );
    CREATE INDEX IF NOT EXISTS "comment_thread_subscriptions_member_idx"
      ON "comment_thread_subscriptions" ("member_id");
    CREATE INDEX IF NOT EXISTS "comment_thread_subscriptions_thread_idx"
      ON "comment_thread_subscriptions" ("thread_id");

    CREATE TABLE IF NOT EXISTS "outbox_events" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "event_type" varchar(128) NOT NULL,
      "payload" jsonb NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "outbox_events_event_type_created_at_idx"
      ON "outbox_events" ("event_type", "created_at");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "outbox_events";
    DROP TABLE IF EXISTS "comment_thread_subscriptions";
  `)
}

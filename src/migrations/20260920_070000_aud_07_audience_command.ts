import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** AUD-07 Audience Command Center, Bounded Experiments & Attribution Evidence */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "audience_experiments" (
      "id" serial PRIMARY KEY,
      "site_id" integer,
      "title" varchar NOT NULL,
      "hypothesis" text NOT NULL,
      "channel" varchar NOT NULL DEFAULT 'email',
      "metric" varchar NOT NULL DEFAULT 'open_rate',
      "window_hours" integer DEFAULT 24,
      "status" varchar NOT NULL DEFAULT 'draft',
      "variants" jsonb NOT NULL,
      "guardrails" jsonb NOT NULL,
      "winner_decision" jsonb DEFAULT '{}'::jsonb,
      "allocations_hash" varchar,
      "total_allocated" integer DEFAULT 0,
      "started_at" timestamp(3) with time zone,
      "concluded_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "audience_experiments_site_id_idx" ON "audience_experiments" ("site_id");
    CREATE INDEX IF NOT EXISTS "audience_experiments_status_idx" ON "audience_experiments" ("status");

    CREATE TABLE IF NOT EXISTS "audience_attribution_events" (
      "id" serial PRIMARY KEY,
      "site_id" integer,
      "campaign_id" varchar NOT NULL,
      "variant_id" varchar,
      "channel" varchar NOT NULL DEFAULT 'email',
      "event_type" varchar NOT NULL,
      "recipient_hash" varchar,
      "is_bot" boolean DEFAULT false,
      "bot_reason" varchar,
      "attribution_model" varchar DEFAULT 'last-non-direct',
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "audience_attribution_events_campaign_idx" ON "audience_attribution_events" ("campaign_id");
    CREATE INDEX IF NOT EXISTS "audience_attribution_events_occurred_idx" ON "audience_attribution_events" ("occurred_at");
    CREATE INDEX IF NOT EXISTS "audience_attribution_events_is_bot_idx" ON "audience_attribution_events" ("is_bot");

    CREATE TABLE IF NOT EXISTS "audience_command_snapshots" (
      "id" serial PRIMARY KEY,
      "site_id" integer,
      "snapshot_type" varchar NOT NULL,
      "window_key" varchar NOT NULL,
      "payload" jsonb NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "audience_command_snapshots_lookup_idx" ON "audience_command_snapshots" ("site_id", "snapshot_type", "window_key");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "audience_command_snapshots";
    DROP TABLE IF EXISTS "audience_attribution_events";
    DROP TABLE IF EXISTS "audience_experiments";
  `)
}

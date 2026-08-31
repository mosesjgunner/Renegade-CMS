import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "venue_address" varchar,
      ADD COLUMN IF NOT EXISTS "online_url" varchar,
      ADD COLUMN IF NOT EXISTS "organizer_name" varchar,
      ADD COLUMN IF NOT EXISTS "organizer_url" varchar,
      ADD COLUMN IF NOT EXISTS "capacity" numeric,
      ADD COLUMN IF NOT EXISTS "registration_url" varchar,
      ADD COLUMN IF NOT EXISTS "recurrence" jsonb,
      ADD COLUMN IF NOT EXISTS "recurrence_overrides" jsonb;
    CREATE TABLE IF NOT EXISTS "events_rels" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
      "path" varchar NOT NULL,
      "categories_id" uuid REFERENCES "categories"("id") ON DELETE cascade,
      "content_id" uuid REFERENCES "content"("id") ON DELETE cascade,
      "events_id" uuid REFERENCES "events"("id") ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS "events_rels_parent_idx" ON "events_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "events_rels_categories_idx" ON "events_rels" ("categories_id");
    CREATE INDEX IF NOT EXISTS "events_rels_content_idx" ON "events_rels" ("content_id");
    CREATE INDEX IF NOT EXISTS "events_rels_events_idx" ON "events_rels" ("events_id");
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`DROP TABLE IF EXISTS "events_rels" CASCADE; ALTER TABLE "events" DROP COLUMN IF EXISTS "venue_address", DROP COLUMN IF EXISTS "online_url", DROP COLUMN IF EXISTS "organizer_name", DROP COLUMN IF EXISTS "organizer_url", DROP COLUMN IF EXISTS "capacity", DROP COLUMN IF EXISTS "registration_url", DROP COLUMN IF EXISTS "recurrence", DROP COLUMN IF EXISTS "recurrence_overrides";`)
}

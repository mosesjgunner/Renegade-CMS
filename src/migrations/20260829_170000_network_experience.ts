import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/** Product-facing federation records are additive: remote references never become canonical content. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "remote_instances" ADD COLUMN IF NOT EXISTS "moderation_note" varchar;
    ALTER TABLE "remote_actors" ADD COLUMN IF NOT EXISTS "moderation_note" varchar;
    ALTER TABLE "remote_objects" ADD COLUMN IF NOT EXISTS "visibility" varchar DEFAULT 'visible' NOT NULL;
    ALTER TABLE "network_relationships" ADD COLUMN IF NOT EXISTS "remote_activity_id" varchar;
    ALTER TABLE "network_relationships" ADD COLUMN IF NOT EXISTS "ended_at" timestamp(3) with time zone;
    ALTER TABLE "network_relationships" ADD COLUMN IF NOT EXISTS "direction" varchar DEFAULT 'outbound' NOT NULL;
    CREATE INDEX IF NOT EXISTS "remote_objects_visibility_idx" ON "remote_objects" USING btree ("visibility");
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    DROP INDEX IF EXISTS "remote_objects_visibility_idx";
    ALTER TABLE "network_relationships" DROP COLUMN IF EXISTS "ended_at";
    ALTER TABLE "network_relationships" DROP COLUMN IF EXISTS "remote_activity_id";
    ALTER TABLE "network_relationships" DROP COLUMN IF EXISTS "direction";
    ALTER TABLE "remote_objects" DROP COLUMN IF EXISTS "visibility";
    ALTER TABLE "remote_actors" DROP COLUMN IF EXISTS "moderation_note";
    ALTER TABLE "remote_instances" DROP COLUMN IF EXISTS "moderation_note";
  `)
}

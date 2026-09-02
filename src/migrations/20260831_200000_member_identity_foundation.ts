import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "handle" varchar;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "links" jsonb;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "preferences" jsonb;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "moderation_reason" varchar;
    UPDATE "profiles" SET "handle" = 'member-' || substring(replace("member_id"::text, '-', '') from 1 for 12) WHERE "handle" IS NULL;
    ALTER TABLE "profiles" ALTER COLUMN "handle" SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "profiles_handle_idx" ON "profiles" USING btree ("handle");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "profiles_handle_idx";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "preferences", DROP COLUMN IF EXISTS "links", DROP COLUMN IF EXISTS "handle";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "moderation_reason";
  `)
}

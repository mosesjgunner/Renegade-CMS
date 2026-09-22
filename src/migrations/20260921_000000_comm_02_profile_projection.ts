import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_alt" varchar;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "cover_alt" varchar;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "locale" varchar;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "time_zone" varchar;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "discovery_opt_out" boolean DEFAULT false;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "discovery_opt_out";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "time_zone";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "locale";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "cover_alt";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "avatar_alt";
  `)
}

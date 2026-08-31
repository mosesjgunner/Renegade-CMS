import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "checksum" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "focal_point_x" numeric;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "focal_point_y" numeric;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "focal_point_y";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "focal_point_x";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "checksum";
  `)
}

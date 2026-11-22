import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "creator_policy" jsonb;
    ALTER TABLE "member_site_roles"
      ADD COLUMN IF NOT EXISTS "creator_capabilities" jsonb,
      ADD COLUMN IF NOT EXISTS "creator_quota_override" jsonb;
  `)
}

// Rolling back discards creator policies and grants; export them first if needed.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "member_site_roles" DROP COLUMN IF EXISTS "creator_quota_override", DROP COLUMN IF EXISTS "creator_capabilities";
    ALTER TABLE "sites" DROP COLUMN IF EXISTS "creator_policy";
  `)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Reconciles the additive book lifecycle fields for databases migrated before B05's schema fix. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft' NOT NULL;
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Phase B book lifecycle fields are additive; rollback requires a reviewed data migration.',
  )
}

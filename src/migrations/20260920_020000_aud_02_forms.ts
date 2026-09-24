import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** AUD-02 is additive. Published schema snapshots and historical submissions are never rewritten. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "form_definitions" ADD COLUMN IF NOT EXISTS "title" varchar, ADD COLUMN IF NOT EXISTS "copy" varchar, ADD COLUMN IF NOT EXISTS "actions" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "action_state" jsonb DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS "review_notes" jsonb DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS "submitted_at" timestamp(3) with time zone;
    CREATE INDEX IF NOT EXISTS "form_submissions_submitted_at_idx" ON "form_submissions" ("submitted_at");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "form_definitions" DROP COLUMN IF EXISTS "title", DROP COLUMN IF EXISTS "copy", DROP COLUMN IF EXISTS "actions"; ALTER TABLE "form_submissions" DROP COLUMN IF EXISTS "action_state", DROP COLUMN IF EXISTS "review_notes", DROP COLUMN IF EXISTS "submitted_at";`,
  )
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // The shared social state list is a Postgres enum per table; the
  // evergreen pause and the manual-handoff state extend all three.
  await db.execute(sql`ALTER TYPE enum_social_queue_items_status ADD VALUE IF NOT EXISTS 'paused'`)
  await db.execute(
    sql`ALTER TYPE enum_social_queue_items_status ADD VALUE IF NOT EXISTS 'manual-handoff'`,
  )
  await db.execute(
    sql`ALTER TYPE enum_social_network_variants_status ADD VALUE IF NOT EXISTS 'paused'`,
  )
  await db.execute(
    sql`ALTER TYPE enum_social_network_variants_status ADD VALUE IF NOT EXISTS 'manual-handoff'`,
  )
  await db.execute(sql`ALTER TYPE enum_social_drafts_status ADD VALUE IF NOT EXISTS 'paused'`)
  await db.execute(
    sql`ALTER TYPE enum_social_drafts_status ADD VALUE IF NOT EXISTS 'manual-handoff'`,
  )
  await db.execute(sql`
    ALTER TABLE social_queue_items
      ADD COLUMN IF NOT EXISTS recurrence_interval_days integer,
      ADD COLUMN IF NOT EXISTS recurrence_series_key varchar,
      ADD COLUMN IF NOT EXISTS recurrence_occurrence integer,
      ADD COLUMN IF NOT EXISTS handoff jsonb
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS social_queue_items_recurrence_series_key_idx
      ON social_queue_items (recurrence_series_key)
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Postgres cannot drop enum values; 'paused' and 'manual-handoff'
  // remain as harmless unused values after rollback.
  await db.execute(sql`
    ALTER TABLE social_queue_items
      DROP COLUMN IF EXISTS recurrence_interval_days,
      DROP COLUMN IF EXISTS recurrence_series_key,
      DROP COLUMN IF EXISTS recurrence_occurrence,
      DROP COLUMN IF EXISTS handoff
  `)
}

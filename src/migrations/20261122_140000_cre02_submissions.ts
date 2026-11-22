import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE media_upload_sessions
      ADD COLUMN IF NOT EXISTS chunk_manifest jsonb,
      ADD COLUMN IF NOT EXISTS creator_key varchar,
      ADD COLUMN IF NOT EXISTS creator_target varchar,
      ADD COLUMN IF NOT EXISTS review_status varchar,
      ADD COLUMN IF NOT EXISTS creator_details jsonb,
      ADD COLUMN IF NOT EXISTS staging_cleared_at timestamptz;
    CREATE UNIQUE INDEX IF NOT EXISTS media_upload_sessions_creator_key_idx ON media_upload_sessions (creator_key);
    CREATE INDEX IF NOT EXISTS media_upload_sessions_creator_target_idx ON media_upload_sessions (creator_target);
    CREATE INDEX IF NOT EXISTS media_upload_sessions_review_status_idx ON media_upload_sessions (review_status);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE media_upload_sessions DROP COLUMN IF EXISTS chunk_manifest, DROP COLUMN IF EXISTS creator_key,
      DROP COLUMN IF EXISTS creator_target, DROP COLUMN IF EXISTS review_status, DROP COLUMN IF EXISTS creator_details,
      DROP COLUMN IF EXISTS staging_cleared_at;
  `)
}

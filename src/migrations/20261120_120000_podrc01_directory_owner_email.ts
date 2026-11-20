import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-RC-01 (Step 02): opt-in directory-verification owner email.
 *
 * podcast-shows gain `directory_owner_email`: when an operator sets it,
 * the feed emits <itunes:owner><itunes:email> so directories (Apple
 * Podcasts, Spotify) can send ownership-verification mail to that
 * address. It is deliberately a SEPARATE field from `locked_owner_email`
 * (the podcast:locked owner attribute, POD-01): the two tags have
 * different meanings, and neither is ever populated from the other or
 * from an account email. The column is nullable with no default and no
 * backfill — an unset field publishes no owner email, exactly as before.
 *
 * Rollback note: `down` drops exactly this column; any directory owner
 * emails configured after this migration are discarded with it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_shows"
      ADD COLUMN IF NOT EXISTS "directory_owner_email" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_shows"
      DROP COLUMN IF EXISTS "directory_owner_email";
  `)
}

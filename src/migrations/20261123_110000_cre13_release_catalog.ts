import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS creator_release_catalog (
      release_id uuid PRIMARY KEY REFERENCES content_releases(id) ON DELETE CASCADE,
      creation_key text UNIQUE NOT NULL,
      source_kind text NOT NULL CHECK (source_kind IN ('albums', 'creator-projects', 'podcast-episodes', 'videos')),
      source_id uuid NOT NULL,
      entries jsonb NOT NULL,
      published boolean NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS creator_release_catalog_source ON creator_release_catalog (source_kind, source_id);
    CREATE TABLE IF NOT EXISTS creator_release_drafts (
      release_id uuid NOT NULL REFERENCES creator_release_catalog(release_id) ON DELETE CASCADE,
      channel text NOT NULL CHECK (channel IN ('social', 'newsletter')),
      target_id uuid NOT NULL,
      PRIMARY KEY (release_id, channel)
    );
  `)
}

export async function down({ db }: MigrateDownArgs) {
  await db.execute(
    sql`DROP TABLE IF EXISTS creator_release_drafts; DROP TABLE IF EXISTS creator_release_catalog;`,
  )
}

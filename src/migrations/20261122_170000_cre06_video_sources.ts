import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE IF EXISTS social_network_variants ADD COLUMN youtube_upload jsonb;
    CREATE TABLE external_video_sources (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      owner_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      content_id uuid NOT NULL UNIQUE REFERENCES content(id) ON DELETE CASCADE,
      identity varchar NOT NULL,
      provider varchar NOT NULL,
      availability varchar NOT NULL,
      snapshot jsonb,
      expires_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (site_id, identity)
    );
    CREATE INDEX ON external_video_sources(owner_id);
    CREATE INDEX ON external_video_sources(expires_at);
    CREATE INDEX ON external_video_sources(updated_at);
    CREATE INDEX ON external_video_sources(created_at);
    CREATE TABLE youtube_channel_claims (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      owner_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      claim varchar UNIQUE,
      credential varchar,
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (site_id, owner_id)
    );
    CREATE INDEX ON youtube_channel_claims(owner_id);
    CREATE INDEX ON youtube_channel_claims(updated_at);
    CREATE INDEX ON youtube_channel_claims(created_at);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE IF EXISTS social_network_variants DROP COLUMN youtube_upload; DROP TABLE youtube_channel_claims; DROP TABLE external_video_sources;`,
  )
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'creator-media-export';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'creator-media-export';

    CREATE TABLE IF NOT EXISTS media_edit_projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE SET NULL,
      owner_id uuid NOT NULL REFERENCES members(id) ON DELETE SET NULL,
      title varchar NOT NULL,
      revision numeric NOT NULL,
      history jsonb NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS media_edit_projects_site_idx ON media_edit_projects(site_id);
    CREATE INDEX IF NOT EXISTS media_edit_projects_owner_idx ON media_edit_projects(owner_id);
    CREATE INDEX IF NOT EXISTS media_edit_projects_updated_at_idx ON media_edit_projects(updated_at);
    CREATE INDEX IF NOT EXISTS media_edit_projects_created_at_idx ON media_edit_projects(created_at);

    CREATE TABLE IF NOT EXISTS media_edit_exports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE SET NULL,
      owner_id uuid NOT NULL REFERENCES members(id) ON DELETE SET NULL,
      project_id uuid NOT NULL REFERENCES media_edit_projects(id) ON DELETE SET NULL,
      key varchar NOT NULL UNIQUE,
      project_revision numeric NOT NULL,
      profile varchar NOT NULL,
      state varchar NOT NULL,
      snapshot jsonb NOT NULL,
      job_id varchar,
      video_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      thumbnail_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      report jsonb,
      error varchar,
      updated_at timestamptz DEFAULT now() NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS media_edit_exports_site_idx ON media_edit_exports(site_id);
    CREATE INDEX IF NOT EXISTS media_edit_exports_owner_idx ON media_edit_exports(owner_id);
    CREATE INDEX IF NOT EXISTS media_edit_exports_project_idx ON media_edit_exports(project_id);
    CREATE INDEX IF NOT EXISTS media_edit_exports_state_idx ON media_edit_exports(state);
    CREATE INDEX IF NOT EXISTS media_edit_exports_updated_at_idx ON media_edit_exports(updated_at);
    CREATE INDEX IF NOT EXISTS media_edit_exports_created_at_idx ON media_edit_exports(created_at);

    ALTER TABLE media_usages_rels ADD COLUMN IF NOT EXISTS media_edit_projects_id uuid
      REFERENCES media_edit_projects(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS media_usages_rels_media_edit_projects_id_idx
      ON media_usages_rels(media_edit_projects_id);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE media_usages_rels DROP COLUMN IF EXISTS media_edit_projects_id;
    DROP TABLE IF EXISTS media_edit_exports;
    DROP TABLE IF EXISTS media_edit_projects;
  `)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE enum_albums_kind ADD VALUE IF NOT EXISTS 'gallery';
    ALTER TYPE enum_albums_kind ADD VALUE IF NOT EXISTS 'mixed-media';
    ALTER TYPE enum_albums_kind ADD VALUE IF NOT EXISTS 'exhibition';
    ALTER TYPE enum_albums_kind ADD VALUE IF NOT EXISTS 'catalog';

    ALTER TABLE albums
      ADD COLUMN IF NOT EXISTS portfolio_draft jsonb,
      ADD COLUMN IF NOT EXISTS portfolio_published jsonb;

    CREATE TABLE IF NOT EXISTS creator_projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE SET NULL,
      publication_id uuid REFERENCES publications(id) ON DELETE SET NULL,
      space_id uuid REFERENCES spaces(id) ON DELETE SET NULL,
      owner_id uuid REFERENCES members(id) ON DELETE SET NULL,
      title varchar NOT NULL,
      slug varchar NOT NULL,
      canonical_path varchar NOT NULL,
      portfolio_draft jsonb,
      portfolio_published jsonb,
      updated_at timestamptz DEFAULT now() NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS creator_projects_site_canonical_path_idx
      ON creator_projects (site_id, canonical_path);
    CREATE INDEX IF NOT EXISTS creator_projects_site_idx ON creator_projects (site_id);
    CREATE INDEX IF NOT EXISTS creator_projects_publication_idx ON creator_projects (publication_id);
    CREATE INDEX IF NOT EXISTS creator_projects_space_idx ON creator_projects (space_id);
    CREATE INDEX IF NOT EXISTS creator_projects_owner_idx ON creator_projects (owner_id);
    CREATE INDEX IF NOT EXISTS creator_projects_updated_at_idx ON creator_projects (updated_at);
    CREATE INDEX IF NOT EXISTS creator_projects_created_at_idx ON creator_projects (created_at);

    ALTER TABLE payload_locked_documents_rels
      ADD COLUMN IF NOT EXISTS creator_projects_id uuid REFERENCES creator_projects(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_creator_projects_id_idx
      ON payload_locked_documents_rels (creator_projects_id);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE payload_locked_documents_rels DROP COLUMN IF EXISTS creator_projects_id;
    DROP TABLE IF EXISTS creator_projects;
    ALTER TABLE albums DROP COLUMN IF EXISTS portfolio_draft, DROP COLUMN IF EXISTS portfolio_published;
  `)
}

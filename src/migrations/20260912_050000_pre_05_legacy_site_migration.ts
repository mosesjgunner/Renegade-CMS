import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS legacy_migration_runs (
      run_id text PRIMARY KEY,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      stage text NOT NULL,
      source_checksum text NOT NULL,
      options jsonb NOT NULL DEFAULT '{}'::jsonb,
      report jsonb NOT NULL DEFAULT '{}'::jsonb,
      checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_entity_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      activated_at timestamptz,
      rolled_back_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS legacy_migration_quarantine (
      id text PRIMARY KEY,
      run_id text NOT NULL REFERENCES legacy_migration_runs(run_id) ON DELETE CASCADE,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      source_id text NOT NULL,
      item_type text NOT NULL,
      title text,
      kind text NOT NULL,
      name text NOT NULL,
      raw_source text NOT NULL,
      location text,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_legacy_migration_runs_site ON legacy_migration_runs(site_id);
    CREATE INDEX IF NOT EXISTS idx_legacy_migration_quarantine_run ON legacy_migration_quarantine(run_id);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS legacy_migration_quarantine;
    DROP TABLE IF EXISTS legacy_migration_runs;
  `)
}

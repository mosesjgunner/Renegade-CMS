import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS presentation_theme_state (
      site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      revision integer NOT NULL DEFAULT 0, active jsonb, draft jsonb, previous jsonb
    );
    CREATE TABLE IF NOT EXISTS presentation_theme_audit (
      id bigserial PRIMARY KEY, site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      actor_id text NOT NULL, action text NOT NULL, revision integer NOT NULL,
      configuration jsonb, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS presentation_theme_previews (
      token_hash text PRIMARY KEY, site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      actor_id text NOT NULL, configuration jsonb NOT NULL, expires_at timestamptz NOT NULL
    );
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`DROP TABLE IF EXISTS presentation_theme_previews, presentation_theme_audit, presentation_theme_state;`,
  )
}

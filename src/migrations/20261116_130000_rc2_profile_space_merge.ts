import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * RC2-DEBT-01: profile = space merge. The profile is the one canonical
 * member-home record; a space is only that profile's per-site presence.
 * The spaces table carried nine identity fields duplicated verbatim from
 * profiles (member, handle, displayName, avatar, cover, bio, visibility,
 * fieldAudience, layoutTheme) that could drift apart. Drop the duplicated
 * columns and the per-site handle index; make the profile relation
 * required and unique per site (one space per profile per site).
 *
 * Data: every space created by the product (seed, onboarding) already
 * points at its profile. As a backfill for any space whose profile was
 * never linked, resolve it from the profile owned by the space's member
 * before the member column goes away. A space still unlinked after that
 * fails the NOT NULL loudly rather than surviving as a headless record.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE spaces s SET profile_id = p.id
      FROM profiles p
     WHERE s.profile_id IS NULL AND p.member_id = s.member_id;
    DROP INDEX IF EXISTS spaces_site_handle_idx;
    DROP INDEX IF EXISTS spaces_member_idx;
    DROP INDEX IF EXISTS spaces_avatar_idx;
    DROP INDEX IF EXISTS spaces_cover_idx;
    ALTER TABLE spaces
      DROP COLUMN member_id,
      DROP COLUMN handle,
      DROP COLUMN display_name,
      DROP COLUMN avatar_id,
      DROP COLUMN cover_id,
      DROP COLUMN bio,
      DROP COLUMN visibility,
      DROP COLUMN field_audience,
      DROP COLUMN layout_theme;
    ALTER TABLE spaces ALTER COLUMN profile_id SET NOT NULL;
    CREATE UNIQUE INDEX spaces_site_profile_idx ON spaces (site_id, profile_id);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS spaces_site_profile_idx;
    ALTER TABLE spaces ALTER COLUMN profile_id DROP NOT NULL;
    ALTER TABLE spaces
      ADD COLUMN member_id uuid,
      ADD COLUMN handle varchar,
      ADD COLUMN display_name varchar,
      ADD COLUMN avatar_id uuid,
      ADD COLUMN cover_id uuid,
      ADD COLUMN bio varchar,
      ADD COLUMN visibility varchar DEFAULT 'public',
      ADD COLUMN field_audience jsonb,
      ADD COLUMN layout_theme jsonb;
    UPDATE spaces s SET
      member_id = p.member_id,
      handle = p.handle,
      display_name = p.display_name,
      avatar_id = p.avatar_id,
      cover_id = p.cover_id,
      bio = p.bio,
      visibility = p.visibility,
      field_audience = p.field_audience,
      layout_theme = p.layout_theme
      FROM profiles p
     WHERE p.id = s.profile_id;
    CREATE INDEX spaces_member_idx ON spaces (member_id);
    CREATE INDEX spaces_avatar_idx ON spaces (avatar_id);
    CREATE INDEX spaces_cover_idx ON spaces (cover_id);
    CREATE UNIQUE INDEX spaces_site_handle_idx ON spaces (site_id, handle);
  `)
}

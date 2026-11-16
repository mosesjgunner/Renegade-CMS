import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * RC2-DEBT-16: site-settings updates require all-sites authority, which the
 * grant resolver derives from a user-level `isGlobalOwner` flag that existed
 * nowhere in the schema and was set by no code path — so in a multi-site
 * install no principal could ever update site settings (measured 403 for
 * both the site admin and the site owner on a two-site fixture). Give the
 * flag a real column, and backfill it for the one account every existing
 * installation already identifies as its owner: the user recorded in
 * installation_state.owner_user_id at install completion.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN is_global_owner boolean DEFAULT false;
    UPDATE users SET is_global_owner = true
     WHERE id = (SELECT owner_user_id FROM installation_state WHERE singleton = true);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users DROP COLUMN is_global_owner;
  `)
}

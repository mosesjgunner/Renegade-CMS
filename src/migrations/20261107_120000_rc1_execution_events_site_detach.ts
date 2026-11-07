import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * Execution events are the append-only operator audit trail: the collection
 * denies deletes and no product code ever removes them. Their site foreign
 * key was created ON DELETE RESTRICT, which made site deletion physically
 * impossible for any site that had ever emitted an event — the hierarchy
 * guard already exempts these system records when judging a site delete
 * (product-owner decision, Matthew, 2026-11-07), but the database layer
 * still vetoed it. Align the key with the guard's decision: when a site is
 * deleted, its events survive with the site reference detached. The
 * tenant identity is not lost — every event also carries its tenantId.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE execution_events ALTER COLUMN site_id DROP NOT NULL;
    ALTER TABLE execution_events DROP CONSTRAINT execution_events_site_id_fkey;
    ALTER TABLE execution_events ADD CONSTRAINT execution_events_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE execution_events DROP CONSTRAINT execution_events_site_id_fkey;
    ALTER TABLE execution_events ADD CONSTRAINT execution_events_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT;
    ALTER TABLE execution_events ALTER COLUMN site_id SET NOT NULL;
  `)
}

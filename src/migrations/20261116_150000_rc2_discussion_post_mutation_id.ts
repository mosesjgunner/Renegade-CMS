import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * RC2-DEBT-20: the v1 comment surface folds into the live Payload
 * discussions store. The versioned composer's idempotency contract
 * (an Idempotency-Key maps to at most one comment, replayable for
 * 60 seconds) needs a durable mutation key on discussion-posts —
 * the v1 store carried it as comments.client_mutation_id; the live
 * store had no equivalent column.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE discussion_posts ADD COLUMN client_mutation_id varchar;
    CREATE INDEX discussion_posts_client_mutation_id_idx ON discussion_posts (client_mutation_id);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS discussion_posts_client_mutation_id_idx;
    ALTER TABLE discussion_posts DROP COLUMN client_mutation_id;
  `)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * RC2-DEBT-20 fold completion: comment_thread_subscriptions survives
 * the fold keyed by thread id, but a v1 thread id is now a discussion
 * id. The original foreign key pointed at the retired comment_threads
 * table, which made subscribing to any live discussion fail with an
 * FK violation. Re-point the key at discussions, keeping the
 * ON DELETE CASCADE semantics.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "comment_thread_subscriptions"
      DROP CONSTRAINT IF EXISTS "comment_thread_subscriptions_thread_id_fkey";
    ALTER TABLE "comment_thread_subscriptions"
      ADD CONSTRAINT "comment_thread_subscriptions_thread_id_fkey"
      FOREIGN KEY ("thread_id") REFERENCES "discussions"("id") ON DELETE CASCADE;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "comment_thread_subscriptions"
      DROP CONSTRAINT IF EXISTS "comment_thread_subscriptions_thread_id_fkey";
    ALTER TABLE "comment_thread_subscriptions"
      ADD CONSTRAINT "comment_thread_subscriptions_thread_id_fkey"
      FOREIGN KEY ("thread_id") REFERENCES "comment_threads"("id") ON DELETE CASCADE;
  `)
}

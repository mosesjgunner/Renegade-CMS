import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "donation_intents" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar;
    CREATE UNIQUE INDEX IF NOT EXISTS "donation_intents_idempotency_key_idx"
      ON "donation_intents" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "donation_intents_idempotency_key_idx";
    ALTER TABLE "donation_intents" DROP COLUMN IF EXISTS "idempotency_key";
  `)
}

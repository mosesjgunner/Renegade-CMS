import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Adds UUID default generators for integrations tables. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "api_clients" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
    ALTER TABLE "webhook_subscriptions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
    ALTER TABLE "webhook_deliveries" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
    ALTER TABLE "integration_audit_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
    ALTER TABLE "network_signing_keys" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Phase B integrations defaults are additive; rollback requires a reviewed data migration.',
  )
}

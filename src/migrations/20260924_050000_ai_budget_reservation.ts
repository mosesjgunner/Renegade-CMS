import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "ai_connections"
      ADD COLUMN IF NOT EXISTS "budget_month" varchar,
      ADD COLUMN IF NOT EXISTS "spent_month_usd" numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "lease_until" timestamptz,
      ADD COLUMN IF NOT EXISTS "lease_id" varchar,
      ADD COLUMN IF NOT EXISTS "leased_cost_usd" numeric NOT NULL DEFAULT 0;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "ai_connections"
      DROP COLUMN IF EXISTS "budget_month",
      DROP COLUMN IF EXISTS "spent_month_usd",
      DROP COLUMN IF EXISTS "lease_until",
      DROP COLUMN IF EXISTS "lease_id",
      DROP COLUMN IF EXISTS "leased_cost_usd";
  `)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** SHOP-07 lifecycle projections, verified disclosure settings, and immutable receipt linkage. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "receipt_entity_name" varchar;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "verified_nonprofit_status" boolean NOT NULL DEFAULT false;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "verified501c3_status" boolean NOT NULL DEFAULT false;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "verified_tax_deductibility" boolean NOT NULL DEFAULT false;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "tax_disclaimer" varchar;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "donor_wall_minimum_minor" varchar NOT NULL DEFAULT '0';
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "supporter_entitlement" varchar;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "supporter_entitlement_term_days" numeric;
    ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "receipt_snapshot" jsonb;
    ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "supporter_id" uuid REFERENCES "supporters"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "donations_supporter_idx" ON "donations" ("supporter_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "donations_supporter_idx";
    ALTER TABLE "donations" DROP COLUMN IF EXISTS "supporter_id", DROP COLUMN IF EXISTS "receipt_snapshot";
    ALTER TABLE "donation_campaigns" DROP COLUMN IF EXISTS "supporter_entitlement_term_days", DROP COLUMN IF EXISTS "supporter_entitlement", DROP COLUMN IF EXISTS "donor_wall_minimum_minor", DROP COLUMN IF EXISTS "tax_disclaimer", DROP COLUMN IF EXISTS "verified_tax_deductibility", DROP COLUMN IF EXISTS "verified501c3_status", DROP COLUMN IF EXISTS "verified_nonprofit_status", DROP COLUMN IF EXISTS "receipt_entity_name";
  `)
}

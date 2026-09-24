import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Reconcile tenant and ownership scope columns across Audience and Commerce collections.
 * Adds missing publication_id, space_id, and owner_id columns declared by ownerFields().
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "email_templates"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "email_templates_publication_id_idx" ON "email_templates" ("publication_id");
    CREATE INDEX IF NOT EXISTS "email_templates_space_id_idx" ON "email_templates" ("space_id");
    CREATE INDEX IF NOT EXISTS "email_templates_owner_id_idx" ON "email_templates" ("owner_id");

    ALTER TABLE "audience_experiments"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "audience_experiments_publication_id_idx" ON "audience_experiments" ("publication_id");
    CREATE INDEX IF NOT EXISTS "audience_experiments_space_id_idx" ON "audience_experiments" ("space_id");
    CREATE INDEX IF NOT EXISTS "audience_experiments_owner_id_idx" ON "audience_experiments" ("owner_id");

    ALTER TABLE "promotions"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "promotions_publication_id_idx" ON "promotions" ("publication_id");
    CREATE INDEX IF NOT EXISTS "promotions_owner_id_idx" ON "promotions" ("owner_id");

    ALTER TABLE "checkout_proposals"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "checkout_proposals_publication_id_idx" ON "checkout_proposals" ("publication_id");
    CREATE INDEX IF NOT EXISTS "checkout_proposals_owner_id_idx" ON "checkout_proposals" ("owner_id");

    ALTER TABLE "inventory_reservations"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "inventory_reservations_publication_id_idx" ON "inventory_reservations" ("publication_id");
    CREATE INDEX IF NOT EXISTS "inventory_reservations_owner_id_idx" ON "inventory_reservations" ("owner_id");

    ALTER TABLE "pod_connections"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "pod_connections_publication_id_idx" ON "pod_connections" ("publication_id");
    CREATE INDEX IF NOT EXISTS "pod_connections_owner_id_idx" ON "pod_connections" ("owner_id");

    ALTER TABLE "pod_jobs"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "pod_jobs_publication_id_idx" ON "pod_jobs" ("publication_id");
    CREATE INDEX IF NOT EXISTS "pod_jobs_space_id_idx" ON "pod_jobs" ("space_id");
    CREATE INDEX IF NOT EXISTS "pod_jobs_owner_id_idx" ON "pod_jobs" ("owner_id");

    ALTER TABLE "manual_fulfillment_packages"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_publication_id_idx" ON "manual_fulfillment_packages" ("publication_id");
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_space_id_idx" ON "manual_fulfillment_packages" ("space_id");
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_owner_id_idx" ON "manual_fulfillment_packages" ("owner_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "manual_fulfillment_packages"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "space_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "pod_jobs"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "space_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "pod_connections"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "inventory_reservations"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "checkout_proposals"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "promotions"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "audience_experiments"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "space_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "email_templates"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "space_id",
      DROP COLUMN IF EXISTS "owner_id";
  `)
}

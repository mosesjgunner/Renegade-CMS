import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE pod_connections ADD COLUMN merchant_connection_id uuid REFERENCES merchant_connections(id);
    CREATE INDEX pod_connections_merchant_idx ON pod_connections(merchant_connection_id);
    CREATE UNIQUE INDEX pod_jobs_order_package_unique ON pod_jobs(order_id,package_index);
    CREATE UNIQUE INDEX manual_packages_order_package_unique ON manual_fulfillment_packages(order_id,package_index);
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS manual_packages_order_package_unique;
    DROP INDEX IF EXISTS pod_jobs_order_package_unique;
    ALTER TABLE pod_connections DROP COLUMN IF EXISTS merchant_connection_id;
  `)
}

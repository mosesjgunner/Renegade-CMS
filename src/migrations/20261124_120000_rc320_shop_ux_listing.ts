import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price_minor numeric;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS price_currency varchar;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS any_available boolean DEFAULT false;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE products DROP COLUMN IF EXISTS any_available;
    ALTER TABLE products DROP COLUMN IF EXISTS price_currency;
    ALTER TABLE products DROP COLUMN IF EXISTS min_price_minor;
    ALTER TABLE products DROP COLUMN IF EXISTS featured;
  `)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** SHOP-02 carts, versioned promotions, immutable checkout proposals, and inventory reservations. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "version" numeric DEFAULT 1 NOT NULL;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "guest_token_hash" varchar;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "member_id" uuid;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "customer_email" varchar;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "applied_coupon_codes" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "shipping_address" jsonb;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "billing_address" jsonb;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "selected_shipping_rate_id" varchar;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "reconciliation_notes" jsonb DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS "carts_guest_token_hash_idx" ON "carts" ("guest_token_hash");

    DO $$ BEGIN
      ALTER TABLE "carts" ADD CONSTRAINT "carts_member_id_members_id_fk"
        FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS "promotions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "version" numeric DEFAULT 1 NOT NULL,
      "code" varchar NOT NULL,
      "description" varchar NOT NULL,
      "scope" varchar DEFAULT 'order' NOT NULL,
      "discount_type" varchar DEFAULT 'fixed-minor' NOT NULL,
      "discount_value" varchar NOT NULL,
      "max_discount_minor" varchar,
      "currency" varchar NOT NULL,
      "starts_at" timestamp(3) with time zone,
      "ends_at" timestamp(3) with time zone,
      "timezone" varchar,
      "status" varchar DEFAULT 'active' NOT NULL,
      "stacking_rule" varchar DEFAULT 'stackable' NOT NULL,
      "stacking_priority" numeric DEFAULT 0 NOT NULL,
      "usage_limit_total" numeric,
      "usage_count" numeric DEFAULT 0 NOT NULL,
      "usage_limit_per_customer" numeric,
      "eligibility" jsonb DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "promotions_site_code_idx" ON "promotions" ("site_id", "code");

    CREATE TABLE IF NOT EXISTS "checkout_proposals" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "cart_id" uuid NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE,
      "merchant_connection_id" uuid REFERENCES "merchant_connections"("id") ON DELETE SET NULL,
      "cart_version" numeric NOT NULL,
      "currency" varchar NOT NULL,
      "customer" jsonb NOT NULL,
      "shipping_address" jsonb,
      "billing_address" jsonb,
      "selected_shipping_rate" jsonb,
      "pricing_snapshot" jsonb NOT NULL,
      "tax_snapshot" jsonb,
      "consents" jsonb NOT NULL,
      "fulfillment_split" jsonb NOT NULL,
      "integrity_hash" varchar NOT NULL,
      "state" varchar DEFAULT 'active' NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "checkout_proposals_site_integrity_idx" ON "checkout_proposals" ("site_id", "integrity_hash");

    CREATE TABLE IF NOT EXISTS "inventory_reservations" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "cart_id" uuid NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE,
      "proposal_id" uuid REFERENCES "checkout_proposals"("id") ON DELETE SET NULL,
      "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
      "variant_sku" varchar NOT NULL,
      "quantity" numeric NOT NULL,
      "status" varchar DEFAULT 'active' NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "inventory_reservations_site_sku_status_idx" ON "inventory_reservations" ("site_id", "variant_sku", "status");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "inventory_reservations";
    DROP TABLE IF EXISTS "checkout_proposals";
    DROP TABLE IF EXISTS "promotions";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "reconciliation_notes";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "selected_shipping_rate_id";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "billing_address";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "shipping_address";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "applied_coupon_codes";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "customer_email";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "member_id";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "guest_token_hash";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "version";
  `)
}

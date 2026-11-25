import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "enterprise_idp_connections" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "label" varchar NOT NULL,
      "issuer" varchar NOT NULL,
      "client_id" varchar NOT NULL,
      "redirect_uri" varchar NOT NULL,
      "scopes" jsonb NOT NULL,
      "status" varchar NOT NULL DEFAULT 'active',
      "last_tested_at" timestamptz,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "enterprise_idp_connections_updated_at_idx" ON "enterprise_idp_connections"("updated_at");
    CREATE INDEX IF NOT EXISTS "enterprise_idp_connections_created_at_idx" ON "enterprise_idp_connections"("created_at");

    CREATE TABLE IF NOT EXISTS "enterprise_idp_credentials" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "connection_id" uuid NOT NULL UNIQUE REFERENCES "enterprise_idp_connections"("id") ON DELETE CASCADE,
      "envelope" jsonb NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "enterprise_idp_credentials_connection_idx" ON "enterprise_idp_credentials"("connection_id");
    CREATE INDEX IF NOT EXISTS "enterprise_idp_credentials_updated_at_idx" ON "enterprise_idp_credentials"("updated_at");
    CREATE INDEX IF NOT EXISTS "enterprise_idp_credentials_created_at_idx" ON "enterprise_idp_credentials"("created_at");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "enterprise_idp_connections_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_enterprise_idp_connections_fk"
        FOREIGN KEY ("enterprise_idp_connections_id") REFERENCES "public"."enterprise_idp_connections"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_enterprise_idp_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("enterprise_idp_connections_id");
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "enterprise_idp_credentials_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_enterprise_idp_credentials_fk"
        FOREIGN KEY ("enterprise_idp_credentials_id") REFERENCES "public"."enterprise_idp_credentials"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_enterprise_idp_credentials_id_idx" ON "payload_locked_documents_rels" USING btree ("enterprise_idp_credentials_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_enterprise_idp_connections_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_enterprise_idp_connections_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_enterprise_idp_credentials_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_enterprise_idp_credentials_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "enterprise_idp_connections_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "enterprise_idp_credentials_id";
    DROP TABLE IF EXISTS "enterprise_idp_credentials";
    DROP TABLE IF EXISTS "enterprise_idp_connections";
  `)
}

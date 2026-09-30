import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "ai_connections" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "label" varchar NOT NULL,
      "provider_key" varchar NOT NULL,
      "endpoint" varchar NOT NULL,
      "model" varchar NOT NULL,
      "models" jsonb NOT NULL,
      "capabilities" jsonb NOT NULL,
      "allowed_tasks" jsonb NOT NULL,
      "status" varchar NOT NULL,
      "last_error" varchar,
      "last_tested_at" timestamptz,
      "per_task_usd" numeric NOT NULL,
      "monthly_usd" numeric NOT NULL,
      "max_input_tokens" numeric NOT NULL,
      "max_output_tokens" numeric NOT NULL,
      "input_usd_per1k" numeric NOT NULL,
      "output_usd_per1k" numeric NOT NULL,
      "created_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "ai_connections_site_idx" ON "ai_connections"("site_id");
    CREATE INDEX IF NOT EXISTS "ai_connections_publication_idx" ON "ai_connections"("publication_id");
    CREATE INDEX IF NOT EXISTS "ai_connections_updated_at_idx" ON "ai_connections"("updated_at");
    CREATE INDEX IF NOT EXISTS "ai_connections_created_at_idx" ON "ai_connections"("created_at");

    CREATE TABLE IF NOT EXISTS "ai_credentials" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "connection_id" uuid NOT NULL UNIQUE REFERENCES "ai_connections"("id") ON DELETE CASCADE,
      "envelope" jsonb NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "ai_credentials_updated_at_idx" ON "ai_credentials"("updated_at");
    CREATE INDEX IF NOT EXISTS "ai_credentials_created_at_idx" ON "ai_credentials"("created_at");

    CREATE TABLE IF NOT EXISTS "ai_proposals" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "connection_id" uuid REFERENCES "ai_connections"("id") ON DELETE SET NULL,
      "task" varchar NOT NULL,
      "target_collection" varchar NOT NULL,
      "target_id" varchar NOT NULL,
      "target_updated_at" timestamptz NOT NULL,
      "status" varchar NOT NULL,
      "original" jsonb,
      "output" jsonb,
      "context_preview" jsonb NOT NULL,
      "usage" jsonb,
      "audit_id" varchar NOT NULL,
      "requested_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "decided_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "decided_at" timestamptz,
      "failure_code" varchar,
      "application" jsonb,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "ai_proposals_site_idx" ON "ai_proposals"("site_id");
    CREATE INDEX IF NOT EXISTS "ai_proposals_connection_idx" ON "ai_proposals"("connection_id");
    CREATE INDEX IF NOT EXISTS "ai_proposals_target_id_idx" ON "ai_proposals"("target_id");
    CREATE INDEX IF NOT EXISTS "ai_proposals_updated_at_idx" ON "ai_proposals"("updated_at");
    CREATE INDEX IF NOT EXISTS "ai_proposals_created_at_idx" ON "ai_proposals"("created_at");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "ai_proposals";
    DROP TABLE IF EXISTS "ai_credentials";
    DROP TABLE IF EXISTS "ai_connections";
  `)
}

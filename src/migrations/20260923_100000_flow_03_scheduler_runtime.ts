import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Reconcile the persisted schedule worker lease and retry contract. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "scheduled_publish_jobs"
      ADD COLUMN IF NOT EXISTS "lease_owner" varchar,
      ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "retry_count" numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "max_retries" numeric NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS "last_error" varchar;
    ALTER TYPE "enum_scheduled_publish_jobs_status" ADD VALUE IF NOT EXISTS 'processing';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM "scheduled_publish_jobs"
        WHERE "status" = 'processing'
          OR "lease_owner" IS NOT NULL OR "lease_expires_at" IS NOT NULL
          OR "retry_count" <> 0 OR "max_retries" <> 3 OR "last_error" IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Cannot roll back active schedule leases or retry evidence.';
      END IF;
    END $$;
    ALTER TABLE "scheduled_publish_jobs"
      DROP COLUMN IF EXISTS "lease_owner",
      DROP COLUMN IF EXISTS "lease_expires_at",
      DROP COLUMN IF EXISTS "retry_count",
      DROP COLUMN IF EXISTS "max_retries",
      DROP COLUMN IF EXISTS "last_error";
  `)
  // PostgreSQL cannot remove an enum value in place. Retain 'processing' so rollback
  // never rewrites or rejects existing status values.
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Persist the release-review and execution fields already used by the collection. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "content_releases"
      ADD COLUMN IF NOT EXISTS "name" varchar,
      ADD COLUMN IF NOT EXISTS "purpose" varchar,
      ADD COLUMN IF NOT EXISTS "owner_team" varchar,
      ADD COLUMN IF NOT EXISTS "planned_instant" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "labels" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "campaign" varchar,
      ADD COLUMN IF NOT EXISTS "dependencies" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "release_revision" numeric DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "artifacts" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "gate_snapshot" jsonb,
      ADD COLUMN IF NOT EXISTS "approvals" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "saga_steps" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "resulting_urls" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "lease_owner" varchar,
      ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp(3) with time zone;
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'in-review';
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'approved';
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'completed';
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'partially-failed';
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'failed';
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'rolled-back';
    CREATE INDEX IF NOT EXISTS "content_releases_planned_instant_idx"
      ON "content_releases" ("planned_instant");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM "content_releases"
        WHERE "status" IN ('in-review', 'approved', 'completed', 'partially-failed', 'failed', 'rolled-back')
          OR "name" IS NOT NULL OR "purpose" IS NOT NULL OR "owner_team" IS NOT NULL
          OR "planned_instant" IS NOT NULL OR "campaign" IS NOT NULL
          OR "gate_snapshot" IS NOT NULL OR "lease_owner" IS NOT NULL
          OR "lease_expires_at" IS NOT NULL
          OR COALESCE("labels", '[]'::jsonb) <> '[]'::jsonb
          OR COALESCE("dependencies", '[]'::jsonb) <> '[]'::jsonb
          OR COALESCE("release_revision", 1) <> 1
          OR COALESCE("artifacts", '[]'::jsonb) <> '[]'::jsonb
          OR COALESCE("approvals", '[]'::jsonb) <> '[]'::jsonb
          OR COALESCE("saga_steps", '[]'::jsonb) <> '[]'::jsonb
          OR COALESCE("resulting_urls", '[]'::jsonb) <> '[]'::jsonb
      ) THEN
        RAISE EXCEPTION 'Cannot roll back release lifecycle or snapshot evidence.';
      END IF;
    END $$;
    DROP INDEX IF EXISTS "content_releases_planned_instant_idx";
    ALTER TABLE "content_releases"
      DROP COLUMN IF EXISTS "name",
      DROP COLUMN IF EXISTS "purpose",
      DROP COLUMN IF EXISTS "owner_team",
      DROP COLUMN IF EXISTS "planned_instant",
      DROP COLUMN IF EXISTS "labels",
      DROP COLUMN IF EXISTS "campaign",
      DROP COLUMN IF EXISTS "dependencies",
      DROP COLUMN IF EXISTS "release_revision",
      DROP COLUMN IF EXISTS "artifacts",
      DROP COLUMN IF EXISTS "gate_snapshot",
      DROP COLUMN IF EXISTS "approvals",
      DROP COLUMN IF EXISTS "saga_steps",
      DROP COLUMN IF EXISTS "resulting_urls",
      DROP COLUMN IF EXISTS "lease_owner",
      DROP COLUMN IF EXISTS "lease_expires_at";
  `)
  // Leave added enum labels in place. Removing them requires rebuilding the type.
}

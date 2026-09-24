import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-05D: explainable, human-review-only abuse triage and case-console metadata. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "priority" varchar(16) NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('low','normal','high','urgent'));
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "rule_categories" jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "sla_deadline" timestamp(3) with time zone;
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "triage_payload" jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "disposition" varchar(32);
    -- Forum posts previously only had a quarantine bit.  Keep that bit for the
    -- public-read projection, while recording the distinct human-review state.
    ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "review_status" varchar(32) NOT NULL DEFAULT 'visible' CHECK ("review_status" IN ('visible','pending_review','resolved'));
    CREATE INDEX IF NOT EXISTS "moderation_cases_console_idx" ON "moderation_cases" ("site_id", "status", "priority", "sla_deadline");
    CREATE TABLE IF NOT EXISTS "community_abuse_heuristic_configs" (
      "site_id" uuid PRIMARY KEY REFERENCES "sites"("id") ON DELETE CASCADE,
      "config" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS "moderation_submission_fingerprints" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "author_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE, "target_type" varchar(32) NOT NULL, "target_id" uuid NOT NULL,
      "fingerprint" varchar(16) NOT NULL, "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "moderation_submission_fingerprints_velocity_idx" ON "moderation_submission_fingerprints" ("site_id","author_id","created_at" DESC);
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "moderation_submission_fingerprints";
    DROP TABLE IF EXISTS "community_abuse_heuristic_configs";
    DROP INDEX IF EXISTS "moderation_cases_console_idx";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "disposition";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "triage_payload";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "sla_deadline";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "rule_categories";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "priority";
    ALTER TABLE "forum_posts" DROP COLUMN IF EXISTS "review_status";
  `)
}

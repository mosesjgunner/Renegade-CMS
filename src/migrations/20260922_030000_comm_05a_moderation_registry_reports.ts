import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-05A: immutable policy versions and durable, coalesced report evidence. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "community_policies" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "policy_key" varchar(128) NOT NULL,
      "version" integer NOT NULL CHECK ("version" > 0),
      "policy_payload" jsonb NOT NULL,
      "created_by_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "community_policies_site_key_version_unique" UNIQUE ("site_id", "policy_key", "version")
    );
    CREATE INDEX IF NOT EXISTS "community_policies_current_lookup_idx" ON "community_policies" ("site_id", "policy_key", "version" DESC);

    CREATE TABLE IF NOT EXISTS "moderation_cases" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "target_type" varchar(32) NOT NULL CHECK ("target_type" IN ('comment','forum_post','forum_topic','member_profile','message')),
      "target_id" uuid NOT NULL,
      "status" varchar(32) NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','closed')),
      "opened_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "last_reported_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "moderation_cases_coalesce_idx" ON "moderation_cases" ("site_id", "target_type", "target_id", "last_reported_at" DESC);

    ALTER TABLE "community_reports" ADD COLUMN IF NOT EXISTS "parent_case_id" uuid REFERENCES "moderation_cases"("id") ON DELETE SET NULL;
    ALTER TABLE "community_reports" ADD COLUMN IF NOT EXISTS "target_snapshot_payload" jsonb;
    ALTER TABLE "community_reports" ADD COLUMN IF NOT EXISTS "target_snapshot_hash" varchar(64);
    ALTER TABLE "community_reports" ADD COLUMN IF NOT EXISTS "policy_id" uuid REFERENCES "community_policies"("id") ON DELETE SET NULL;
    ALTER TABLE "community_reports" ADD COLUMN IF NOT EXISTS "policy_version" integer;
    ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_target_type_check" CHECK ("target_type" IN ('comment','forum_post','forum_topic','member_profile','message','post','discussion','member')) NOT VALID;
    CREATE INDEX IF NOT EXISTS "community_reports_parent_case_idx" ON "community_reports" ("parent_case_id");

    CREATE OR REPLACE FUNCTION "community_policy_versions_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'community policy versions are immutable' USING ERRCODE = '23514'; END; $$;
    DROP TRIGGER IF EXISTS "community_policies_immutable" ON "community_policies";
    CREATE TRIGGER "community_policies_immutable" BEFORE UPDATE OR DELETE ON "community_policies"
      FOR EACH ROW EXECUTE FUNCTION "community_policy_versions_immutable"();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS "community_policies_immutable" ON "community_policies";
    DROP FUNCTION IF EXISTS "community_policy_versions_immutable"();
    ALTER TABLE "community_reports" DROP CONSTRAINT IF EXISTS "community_reports_target_type_check";
    ALTER TABLE "community_reports" DROP COLUMN IF EXISTS "policy_version";
    ALTER TABLE "community_reports" DROP COLUMN IF EXISTS "policy_id";
    ALTER TABLE "community_reports" DROP COLUMN IF EXISTS "target_snapshot_hash";
    ALTER TABLE "community_reports" DROP COLUMN IF EXISTS "target_snapshot_payload";
    ALTER TABLE "community_reports" DROP COLUMN IF EXISTS "parent_case_id";
    DROP TABLE IF EXISTS "moderation_cases";
    DROP TABLE IF EXISTS "community_policies";
  `)
}

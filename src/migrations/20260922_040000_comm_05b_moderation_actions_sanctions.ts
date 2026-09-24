import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-05B: case-bound, scoped moderation decisions and write sanctions. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "closed_at" timestamp(3) with time zone;
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "closed_by_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "case_id" uuid REFERENCES "moderation_cases"("id") ON DELETE SET NULL;
    ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "scope" varchar(16) NOT NULL DEFAULT 'object' CHECK ("scope" IN ('object','space','site_global'));
    ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
    ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "expires_at" timestamp(3) with time zone;
    ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "actor_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "moderation_actions_case_idx" ON "moderation_actions" ("case_id", "occurred_at" DESC);

    CREATE TABLE IF NOT EXISTS "member_sanctions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "action_id" uuid NOT NULL REFERENCES "moderation_actions"("id") ON DELETE RESTRICT,
      "sanction_type" varchar(32) NOT NULL CHECK ("sanction_type" IN ('suspend_posting','ban_member')),
      "scope" varchar(16) NOT NULL CHECK ("scope" IN ('object','space','site_global')),
      "scope_id" uuid,
      "starts_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "expires_at" timestamp(3) with time zone,
      "revoked_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CHECK (("scope" = 'site_global' AND "scope_id" IS NULL) OR ("scope" <> 'site_global' AND "scope_id" IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS "member_sanctions_active_lookup_idx" ON "member_sanctions" ("site_id", "member_id", "scope", "scope_id", "expires_at") WHERE "revoked_at" IS NULL;

    ALTER TABLE "forum_topics" ADD COLUMN IF NOT EXISTS "is_quarantined" boolean NOT NULL DEFAULT false;
    ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "is_quarantined" boolean NOT NULL DEFAULT false;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "forum_posts" DROP COLUMN IF EXISTS "is_quarantined";
    ALTER TABLE "forum_topics" DROP COLUMN IF EXISTS "is_quarantined";
    DROP TABLE IF EXISTS "member_sanctions";
    DROP INDEX IF EXISTS "moderation_actions_case_idx";
    ALTER TABLE "moderation_actions" DROP COLUMN IF EXISTS "actor_member_id";
    ALTER TABLE "moderation_actions" DROP COLUMN IF EXISTS "expires_at";
    ALTER TABLE "moderation_actions" DROP COLUMN IF EXISTS "scope_id";
    ALTER TABLE "moderation_actions" DROP COLUMN IF EXISTS "scope";
    ALTER TABLE "moderation_actions" DROP COLUMN IF EXISTS "case_id";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "closed_by_member_id";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "closed_at";
  `)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-05C: appeal decisions and an append-only, per-site SHA-256 audit chain. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    -- Keep appeal references tenant-bound even when somebody bypasses the service layer.
    CREATE UNIQUE INDEX IF NOT EXISTS "moderation_actions_site_id_id_unique" ON "moderation_actions" ("site_id", "id");
    CREATE TABLE IF NOT EXISTS "moderation_appeals" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "moderation_action_id" uuid NOT NULL,
      "appellant_member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "reason" text NOT NULL,
      "status" varchar(16) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','accepted','rejected')),
      "reviewed_by_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "reviewed_at" timestamp(3) with time zone,
      "decision_reason" text,
      "reversal_action_id" uuid,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "moderation_appeals_one_per_action" UNIQUE ("moderation_action_id"),
      CONSTRAINT "moderation_appeals_action_site_fk" FOREIGN KEY ("site_id", "moderation_action_id") REFERENCES "moderation_actions" ("site_id", "id") ON DELETE RESTRICT,
      CONSTRAINT "moderation_appeals_reversal_site_fk" FOREIGN KEY ("site_id", "reversal_action_id") REFERENCES "moderation_actions" ("site_id", "id") ON DELETE RESTRICT,
      CHECK (("status" = 'pending' AND "reviewed_at" IS NULL AND "reviewed_by_member_id" IS NULL AND "decision_reason" IS NULL AND "reversal_action_id" IS NULL)
        OR ("status" = 'accepted' AND "reviewed_at" IS NOT NULL AND "reviewed_by_member_id" IS NOT NULL AND "decision_reason" IS NOT NULL AND "reversal_action_id" IS NOT NULL)
        OR ("status" = 'rejected' AND "reviewed_at" IS NOT NULL AND "reviewed_by_member_id" IS NOT NULL AND "decision_reason" IS NOT NULL AND "reversal_action_id" IS NULL))
    );
    CREATE INDEX IF NOT EXISTS "moderation_appeals_pending_idx" ON "moderation_appeals" ("site_id", "status", "created_at") WHERE "status" = 'pending';

    CREATE TABLE IF NOT EXISTS "community_audit_log" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "event_type" varchar(96) NOT NULL,
      "event_payload" jsonb NOT NULL,
      "previous_hash" varchar(64),
      "record_hash" varchar(64) NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "community_audit_log_chain_idx" ON "community_audit_log" ("site_id", "created_at", "id");

    CREATE OR REPLACE FUNCTION "community_audit_log_chain_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE prior_hash text;
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext(NEW.site_id::text));
      SELECT record_hash INTO prior_hash FROM community_audit_log WHERE site_id = NEW.site_id ORDER BY created_at DESC, id DESC LIMIT 1;
      NEW.previous_hash := prior_hash;
      NEW.record_hash := encode(digest(coalesce(prior_hash, '') || NEW.event_type || NEW.event_payload::text, 'sha256'), 'hex');
      RETURN NEW;
    END; $$;
    CREATE OR REPLACE FUNCTION "community_audit_log_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'community audit log is append-only' USING ERRCODE = '23514'; END; $$;
    DROP TRIGGER IF EXISTS "community_audit_log_hash_chain" ON "community_audit_log";
    CREATE TRIGGER "community_audit_log_hash_chain" BEFORE INSERT ON "community_audit_log" FOR EACH ROW EXECUTE FUNCTION "community_audit_log_chain_insert"();
    DROP TRIGGER IF EXISTS "community_audit_log_no_mutation" ON "community_audit_log";
    CREATE TRIGGER "community_audit_log_no_mutation" BEFORE UPDATE OR DELETE ON "community_audit_log" FOR EACH ROW EXECUTE FUNCTION "community_audit_log_immutable"();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS "community_audit_log_no_mutation" ON "community_audit_log";
    DROP TRIGGER IF EXISTS "community_audit_log_hash_chain" ON "community_audit_log";
    DROP FUNCTION IF EXISTS "community_audit_log_immutable"();
    DROP FUNCTION IF EXISTS "community_audit_log_chain_insert"();
    DROP TABLE IF EXISTS "community_audit_log";
    DROP TABLE IF EXISTS "moderation_appeals";
    DROP INDEX IF EXISTS "moderation_actions_site_id_id_unique";
  `)
}

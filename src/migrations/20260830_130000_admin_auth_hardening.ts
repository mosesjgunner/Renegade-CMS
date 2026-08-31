import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_users_role" ADD VALUE IF NOT EXISTS 'administrator';
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "name" varchar NOT NULL DEFAULT 'Passkey';
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp(3) with time zone;
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "transports" jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "registration_challenge" varchar;
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "registration_expires_at" timestamp(3) with time zone;
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "login_expires_at" timestamp(3) with time zone;
    CREATE TABLE IF NOT EXISTS "admin_sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "revoked_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "last_seen_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "admin_sessions" ADD COLUMN IF NOT EXISTS "registration_challenge" varchar;
    ALTER TABLE "admin_sessions" ADD COLUMN IF NOT EXISTS "registration_expires_at" timestamp(3) with time zone;
    CREATE TABLE IF NOT EXISTS "admin_auth_audit_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "event" varchar NOT NULL,
      "credential_id" varchar,
      "ip_hash" varchar,
      "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "admin_auth_rate_limits" (
      "key" varchar PRIMARY KEY NOT NULL,
      "window_started_at" timestamp(3) with time zone NOT NULL,
      "attempts" integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS "admin_sessions_user_id_idx" ON "admin_sessions" ("user_id");
    CREATE INDEX IF NOT EXISTS "admin_auth_audit_events_user_id_idx" ON "admin_auth_audit_events" ("user_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "admin_auth_rate_limits";
    DROP TABLE IF EXISTS "admin_auth_audit_events";
    DROP TABLE IF EXISTS "admin_sessions";
    ALTER TABLE "passkeys" DROP COLUMN IF EXISTS "registration_expires_at", DROP COLUMN IF EXISTS "registration_challenge", DROP COLUMN IF EXISTS "transports", DROP COLUMN IF EXISTS "last_used_at", DROP COLUMN IF EXISTS "name";
  `)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** AUD-01 is additive: historical consent/suppression records remain valid evidence. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phone_e164" varchar;
    ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "erased_at" timestamp(3) with time zone;
    ALTER TABLE "subscriber_confirmation_tokens" ADD COLUMN IF NOT EXISTS "purpose" varchar DEFAULT 'confirmation', ADD COLUMN IF NOT EXISTS "revoked_at" timestamp(3) with time zone;
    ALTER TABLE "consent_events" ADD COLUMN IF NOT EXISTS "channel" varchar, ADD COLUMN IF NOT EXISTS "purpose" varchar, ADD COLUMN IF NOT EXISTS "policy_version" varchar, ADD COLUMN IF NOT EXISTS "capture_source" varchar, ADD COLUMN IF NOT EXISTS "proof_reference" varchar, ADD COLUMN IF NOT EXISTS "jurisdiction" varchar, ADD COLUMN IF NOT EXISTS "actor_id" integer, ADD COLUMN IF NOT EXISTS "ip_digest" varchar, ADD COLUMN IF NOT EXISTS "user_agent_digest" varchar;
    ALTER TABLE "preferences" ADD COLUMN IF NOT EXISTS "derived_at" timestamp(3) with time zone;
    ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "scope" varchar DEFAULT 'site', ADD COLUMN IF NOT EXISTS "source" varchar, ADD COLUMN IF NOT EXISTS "details" jsonb;
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "phone_e164"; ALTER TABLE "subscribers" DROP COLUMN IF EXISTS "erased_at";`,
  )
}

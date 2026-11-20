import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * UXI-02 (UX-INSTALL remainder): shared task-readiness + setup drafts.
 *
 * Additive only — new nullable columns on the singleton
 * `installation_state` row, no new tables, no changes to existing columns:
 *
 * - `setup_draft` (jsonb): the sanitized, non-secret setup draft written
 *   by src/modules/operations/setup-draft.ts. Bootstrap tokens, passkey
 *   material and recovery codes are never stored in it (allowlist
 *   sanitizer + forbidden-key scan in that module).
 * - `setup_draft_claim_hash`: HMAC hash of the HttpOnly draft-claim
 *   cookie that owns the draft (the raw claim is never stored).
 * - `setup_draft_version`: optimistic-concurrency token; every save must
 *   present the version it read and the UPDATE is predicated on it.
 * - `setup_draft_operation_id` / `setup_draft_expires_at`: the in-flight
 *   setup operation and the draft's retention deadline.
 * - `task_readiness_snapshot` (jsonb) / `task_readiness_checked_at`: the
 *   latest task-readiness evaluation persisted by
 *   src/modules/operations/task-readiness.ts for operator surfaces.
 *
 * Rollback note: `down` drops exactly these columns; any in-progress
 * setup draft is lost (setup restarts from an empty form, enrollment
 * state itself is untouched).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "installation_state" ADD COLUMN IF NOT EXISTS "setup_draft" jsonb;
    ALTER TABLE "installation_state" ADD COLUMN IF NOT EXISTS "setup_draft_claim_hash" varchar;
    ALTER TABLE "installation_state" ADD COLUMN IF NOT EXISTS "setup_draft_version" integer DEFAULT 0 NOT NULL;
    ALTER TABLE "installation_state" ADD COLUMN IF NOT EXISTS "setup_draft_operation_id" varchar;
    ALTER TABLE "installation_state" ADD COLUMN IF NOT EXISTS "setup_draft_expires_at" timestamp(3) with time zone;
    ALTER TABLE "installation_state" ADD COLUMN IF NOT EXISTS "task_readiness_snapshot" jsonb;
    ALTER TABLE "installation_state" ADD COLUMN IF NOT EXISTS "task_readiness_checked_at" timestamp(3) with time zone;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "installation_state" DROP COLUMN IF EXISTS "task_readiness_checked_at";
    ALTER TABLE "installation_state" DROP COLUMN IF EXISTS "task_readiness_snapshot";
    ALTER TABLE "installation_state" DROP COLUMN IF EXISTS "setup_draft_expires_at";
    ALTER TABLE "installation_state" DROP COLUMN IF EXISTS "setup_draft_operation_id";
    ALTER TABLE "installation_state" DROP COLUMN IF EXISTS "setup_draft_version";
    ALTER TABLE "installation_state" DROP COLUMN IF EXISTS "setup_draft_claim_hash";
    ALTER TABLE "installation_state" DROP COLUMN IF EXISTS "setup_draft";
  `)
}

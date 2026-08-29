import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Additive Quality runtime state; retained issue history makes rollback a reviewed data operation. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_quality_issues_workflow_state" AS ENUM('new', 'assigned', 'in_remediation', 'ready_for_rescan');
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'quality-scan';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'quality-scan';
    ALTER TABLE "quality_scans" ADD COLUMN IF NOT EXISTS "job_id" uuid;
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "workflow_state" "enum_quality_issues_workflow_state" DEFAULT 'new' NOT NULL;
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "category" varchar DEFAULT 'content' NOT NULL;
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp(3) with time zone DEFAULT now() NOT NULL;
    DO $$ BEGIN
      ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_job_id_payload_jobs_id_fk"
        FOREIGN KEY ("job_id") REFERENCES "public"."payload_jobs"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "quality_scans_job_idx" ON "quality_scans" USING btree ("job_id");
    CREATE INDEX IF NOT EXISTS "quality_issues_target_status_idx" ON "quality_issues" USING btree ("target_type", "target_id", "status");
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    '20260829_120000_quality_runtime is additive; rollback requires a reviewed data migration.',
  )
}

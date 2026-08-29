import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Additive release saga state; successful external/domain changes are deliberately not rolled back. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_content_releases_status" ADD VALUE IF NOT EXISTS 'executing';
    ALTER TYPE "public"."enum_content_releases_status" ADD VALUE IF NOT EXISTS 'partial-failure';
    ALTER TYPE "public"."enum_content_releases_status" ADD VALUE IF NOT EXISTS 'blocked';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'content-release-execute';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'content-release-execute';
    ALTER TABLE "content_releases" ADD COLUMN IF NOT EXISTS "execution_job_id" uuid;
    ALTER TABLE "content_releases" ADD COLUMN IF NOT EXISTS "execution_items" jsonb DEFAULT '[]'::jsonb NOT NULL;
    ALTER TABLE "content_releases" ADD COLUMN IF NOT EXISTS "execution_audit" jsonb DEFAULT '[]'::jsonb NOT NULL;
    DO $$ BEGIN
      ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_execution_job_id_payload_jobs_id_fk"
        FOREIGN KEY ("execution_job_id") REFERENCES "public"."payload_jobs"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "content_releases_execution_job_idx" ON "content_releases" USING btree ("execution_job_id");
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    '20260829_110000_content_release_execution is additive; rollback requires a reviewed data migration.',
  )
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Additive durable outbox; the retained rows are also the dead-letter operator view. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'execution-outbox-dispatch';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'execution-outbox-handle';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'execution-outbox-dispatch';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'execution-outbox-handle';
    CREATE TYPE "public"."enum_execution_events_privacy_class" AS ENUM('public', 'internal', 'restricted');
    CREATE TYPE "public"."enum_execution_events_state" AS ENUM('ready', 'dispatched', 'retrying', 'processed', 'dead-letter', 'cancelled');
    CREATE TABLE "execution_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "tenant_id" varchar NOT NULL,
      "actor" jsonb NOT NULL,
      "event_type" varchar NOT NULL,
      "event_version" numeric NOT NULL DEFAULT 1,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "correlation_id" varchar NOT NULL,
      "causation_id" varchar,
      "idempotency_key" varchar NOT NULL,
      "privacy_class" "enum_execution_events_privacy_class" NOT NULL DEFAULT 'internal',
      "payload" jsonb NOT NULL,
      "state" "enum_execution_events_state" NOT NULL DEFAULT 'ready',
      "attempts" numeric NOT NULL DEFAULT 0,
      "last_error" varchar,
      "job_id" varchar,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX "execution_events_idempotency_key_idx" ON "execution_events" USING btree ("idempotency_key");
    CREATE INDEX "execution_events_site_state_created_at_idx" ON "execution_events" USING btree ("site_id", "state", "created_at");
    CREATE INDEX "execution_events_tenant_type_created_at_idx" ON "execution_events" USING btree ("tenant_id", "event_type", "created_at");
    CREATE INDEX "execution_events_event_type_idx" ON "execution_events" USING btree ("event_type");
    CREATE INDEX "execution_events_occurred_at_idx" ON "execution_events" USING btree ("occurred_at");
    CREATE INDEX "execution_events_correlation_id_idx" ON "execution_events" USING btree ("correlation_id");
    CREATE INDEX "execution_events_causation_id_idx" ON "execution_events" USING btree ("causation_id");
    CREATE INDEX "execution_events_state_idx" ON "execution_events" USING btree ("state");
    CREATE INDEX "execution_events_job_id_idx" ON "execution_events" USING btree ("job_id");
    CREATE INDEX "execution_events_updated_at_idx" ON "execution_events" USING btree ("updated_at");
    CREATE INDEX "execution_events_created_at_idx" ON "execution_events" USING btree ("created_at");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "execution_events_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_execution_events_fk" FOREIGN KEY ("execution_events_id") REFERENCES "execution_events"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_execution_events_id_idx" ON "payload_locked_documents_rels" ("execution_events_id");
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    '20260831_090000_phase_b_execution_foundation is additive; rollback requires a reviewed data migration.',
  )
}

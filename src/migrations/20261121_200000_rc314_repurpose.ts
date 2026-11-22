import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * RC3-14 (DEBT-04): durable staging rows for the deterministic content
 * repurpose workflow. A repurpose draft is derived from one published
 * source article, carries full provenance, and materializes into its
 * target collection (as a draft, never published) only after a human
 * approval decision. Nothing is written to any target collection while
 * a row sits in 'pending-approval'.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "content_repurpose_drafts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL,
      "source_content_id" uuid NOT NULL,
      "source_title" varchar NOT NULL,
      "source_checksum" varchar NOT NULL,
      "target_kind" varchar NOT NULL,
      "draft_title" varchar NOT NULL,
      "draft_text" varchar NOT NULL,
      "provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "status" varchar DEFAULT 'pending-approval' NOT NULL,
      "created_by_member_id" uuid NOT NULL,
      "decided_by_member_id" uuid,
      "decided_at" timestamptz,
      "materialized_collection" varchar,
      "materialized_id" varchar,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "content_repurpose_drafts_site_idx"
      ON "content_repurpose_drafts" ("site_id");
    CREATE INDEX IF NOT EXISTS "content_repurpose_drafts_source_idx"
      ON "content_repurpose_drafts" ("source_content_id");
    CREATE INDEX IF NOT EXISTS "content_repurpose_drafts_status_idx"
      ON "content_repurpose_drafts" ("status");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "content_repurpose_drafts";
  `)
}

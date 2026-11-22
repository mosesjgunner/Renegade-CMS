import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * RC3-17 (DEBT-03): durable rows for the editorial depth pass.
 *
 * - grammar_issues / grammar_suggestions: the persisted readback of the
 *   bundled Harper grammar check (area #7). An issue is anchored to a
 *   text node of the article's draft document and carries the document
 *   hash it was computed against, so a later edit marks it stale
 *   instead of applying a suggestion to text that has moved.
 * - offline_drafts / client_mutations: the sync record for offline
 *   authoring (area #22). A client draft is captured against a base
 *   revision; mutations carry an idempotency key and the base document
 *   hash so a reconnect can be replayed safely and a concurrent server
 *   edit surfaces as a conflict instead of an overwrite.
 * - editorial_change_sets: the bounded git-like slice (area #20) — a
 *   proposed change against a base revision, with a persisted
 *   paragraph diff and fast-forward-only application.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- RC3-17 repair found by #21 re-evidence: the 20260830 realtime
    -- migration created realtime_presence.id with no default, while
    -- Payload's insert path relies on the database default (as
    -- realtime_events already has). Presence writes against real
    -- Postgres failed with a not-null violation until this repair.
    ALTER TABLE "realtime_presence" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

    CREATE TABLE IF NOT EXISTS "grammar_issues" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL,
      "article_id" uuid NOT NULL,
      "document_hash" varchar NOT NULL,
      "lint_kind" varchar NOT NULL,
      "message" varchar NOT NULL,
      "span_text" varchar NOT NULL,
      "anchor" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "status" varchar DEFAULT 'open' NOT NULL,
      "created_by" varchar NOT NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "grammar_issues_article_idx"
      ON "grammar_issues" ("article_id");
    CREATE INDEX IF NOT EXISTS "grammar_issues_site_idx"
      ON "grammar_issues" ("site_id");
    CREATE INDEX IF NOT EXISTS "grammar_issues_status_idx"
      ON "grammar_issues" ("status");

    CREATE TABLE IF NOT EXISTS "grammar_suggestions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "issue_id" uuid NOT NULL REFERENCES "grammar_issues" ("id") ON DELETE CASCADE,
      "provider_key" varchar DEFAULT 'harper' NOT NULL,
      "replacement" varchar,
      "explanation" varchar NOT NULL,
      "status" varchar DEFAULT 'proposed' NOT NULL,
      "decided_by" varchar,
      "decided_at" timestamptz,
      "created_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "grammar_suggestions_issue_idx"
      ON "grammar_suggestions" ("issue_id");

    CREATE TABLE IF NOT EXISTS "offline_drafts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL,
      "article_id" uuid NOT NULL,
      "device_id" varchar NOT NULL,
      "base_revision_id" varchar,
      "base_document_hash" varchar NOT NULL,
      "document" jsonb NOT NULL,
      "status" varchar DEFAULT 'local-only' NOT NULL,
      "created_by" varchar NOT NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "offline_drafts_article_idx"
      ON "offline_drafts" ("article_id");
    CREATE INDEX IF NOT EXISTS "offline_drafts_site_idx"
      ON "offline_drafts" ("site_id");

    CREATE TABLE IF NOT EXISTS "client_mutations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL,
      "article_id" uuid NOT NULL,
      "offline_draft_id" uuid REFERENCES "offline_drafts" ("id") ON DELETE CASCADE,
      "idempotency_key" varchar NOT NULL,
      "base_document_hash" varchar NOT NULL,
      "mutation_type" varchar NOT NULL,
      "status" varchar NOT NULL,
      "result_revision_id" varchar,
      "created_by" varchar NOT NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "client_mutations_idempotency_idx"
      ON "client_mutations" ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "client_mutations_draft_idx"
      ON "client_mutations" ("offline_draft_id");

    CREATE TABLE IF NOT EXISTS "editorial_change_sets" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL,
      "article_id" uuid NOT NULL,
      "base_revision_id" varchar NOT NULL,
      "base_document_hash" varchar NOT NULL,
      "proposed_document" jsonb NOT NULL,
      "diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "status" varchar DEFAULT 'proposed' NOT NULL,
      "created_by" varchar NOT NULL,
      "decided_by" varchar,
      "decided_at" timestamptz,
      "applied_revision_id" varchar,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "editorial_change_sets_article_idx"
      ON "editorial_change_sets" ("article_id");
    CREATE INDEX IF NOT EXISTS "editorial_change_sets_site_idx"
      ON "editorial_change_sets" ("site_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "editorial_change_sets";
    DROP TABLE IF EXISTS "client_mutations";
    DROP TABLE IF EXISTS "offline_drafts";
    DROP TABLE IF EXISTS "grammar_suggestions";
    DROP TABLE IF EXISTS "grammar_issues";
  `)
}

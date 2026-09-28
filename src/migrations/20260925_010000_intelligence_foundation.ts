import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 1. Intelligence Entities
    CREATE TABLE IF NOT EXISTS "intelligence_entities" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "name" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "entity_type" varchar NOT NULL,
      "description" text,
      "aliases" jsonb DEFAULT '[]'::jsonb,
      "same_as" jsonb DEFAULT '[]'::jsonb,
      "confidence" numeric DEFAULT 1.0,
      "external_id" varchar NOT NULL,
      "provenance" jsonb NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "intelligence_entities_site_idx" ON "intelligence_entities"("site_id");
    CREATE INDEX IF NOT EXISTS "intelligence_entities_external_id_idx" ON "intelligence_entities"("external_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "intelligence_entities_site_external_id_unique" ON "intelligence_entities"("site_id", "external_id");

    CREATE TABLE IF NOT EXISTS "intelligence_entities_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "intelligence_entities"("id") ON DELETE CASCADE,
      "path" varchar NOT NULL,
      "topics_id" uuid REFERENCES "topics"("id") ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "intelligence_entities_rels_parent_idx" ON "intelligence_entities_rels"("parent_id");
    CREATE INDEX IF NOT EXISTS "intelligence_entities_rels_topics_idx" ON "intelligence_entities_rels"("topics_id");

    -- 2. Intelligence Claims
    CREATE TABLE IF NOT EXISTS "intelligence_claims" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "target_content_id" uuid REFERENCES "content"("id") ON DELETE SET NULL,
      "target_topic_id" uuid REFERENCES "topics"("id") ON DELETE SET NULL,
      "statement" text NOT NULL,
      "subject_entity_id" uuid REFERENCES "intelligence_entities"("id") ON DELETE SET NULL,
      "predicate" varchar,
      "object_value" text,
      "uncertainty" numeric NOT NULL DEFAULT 0.5,
      "verification_status" varchar NOT NULL DEFAULT 'unverified',
      "external_id" varchar NOT NULL,
      "provenance" jsonb NOT NULL,
      "quote" text,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "intelligence_claims_site_idx" ON "intelligence_claims"("site_id");
    CREATE INDEX IF NOT EXISTS "intelligence_claims_external_id_idx" ON "intelligence_claims"("external_id");
    CREATE INDEX IF NOT EXISTS "intelligence_claims_target_content_idx" ON "intelligence_claims"("target_content_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "intelligence_claims_site_external_id_unique" ON "intelligence_claims"("site_id", "external_id");

    -- 3. Intelligence Citations
    CREATE TABLE IF NOT EXISTS "intelligence_citations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "claim_id" uuid REFERENCES "intelligence_claims"("id") ON DELETE SET NULL,
      "target_content_id" uuid REFERENCES "content"("id") ON DELETE SET NULL,
      "source_id" uuid REFERENCES "sources"("id") ON DELETE SET NULL,
      "source_url" varchar NOT NULL,
      "title" varchar,
      "author" varchar,
      "publisher" varchar,
      "published_at" timestamptz,
      "accessed_at" timestamptz,
      "quote" text,
      "locator" varchar,
      "relevance_score" numeric DEFAULT 1.0,
      "external_id" varchar NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "intelligence_citations_site_idx" ON "intelligence_citations"("site_id");
    CREATE INDEX IF NOT EXISTS "intelligence_citations_claim_idx" ON "intelligence_citations"("claim_id");
    CREATE INDEX IF NOT EXISTS "intelligence_citations_target_content_idx" ON "intelligence_citations"("target_content_id");
    CREATE INDEX IF NOT EXISTS "intelligence_citations_external_id_idx" ON "intelligence_citations"("external_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "intelligence_citations_site_external_id_unique" ON "intelligence_citations"("site_id", "external_id");

    -- 4. Intelligence Analyses
    CREATE TABLE IF NOT EXISTS "intelligence_analyses" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "target_type" varchar NOT NULL DEFAULT 'content',
      "target_id" varchar NOT NULL,
      "content_revision" varchar NOT NULL,
      "source" varchar NOT NULL,
      "version" varchar NOT NULL,
      "timestamp" timestamptz NOT NULL,
      "status" varchar NOT NULL DEFAULT 'pending',
      "evidence" jsonb NOT NULL,
      "error" jsonb,
      "job_id" uuid,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "intelligence_analyses_site_idx" ON "intelligence_analyses"("site_id");
    CREATE INDEX IF NOT EXISTS "intelligence_analyses_target_idx" ON "intelligence_analyses"("target_type", "target_id");
    CREATE INDEX IF NOT EXISTS "intelligence_analyses_revision_idx" ON "intelligence_analyses"("content_revision");
    CREATE UNIQUE INDEX IF NOT EXISTS "intelligence_analyses_dedupe_unique" ON "intelligence_analyses"("site_id", "target_type", "target_id", "content_revision", "source");

    -- 5. Intelligence Findings
    CREATE TABLE IF NOT EXISTS "intelligence_findings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "analysis_id" uuid NOT NULL REFERENCES "intelligence_analyses"("id") ON DELETE CASCADE,
      "target_type" varchar NOT NULL,
      "target_id" varchar NOT NULL,
      "rule_id" varchar NOT NULL,
      "nature" varchar NOT NULL DEFAULT 'deterministic',
      "severity" varchar NOT NULL DEFAULT 'warning',
      "message" text NOT NULL,
      "evidence" jsonb,
      "status" varchar NOT NULL DEFAULT 'open',
      "dedupe_key" varchar NOT NULL UNIQUE,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "intelligence_findings_site_idx" ON "intelligence_findings"("site_id");
    CREATE INDEX IF NOT EXISTS "intelligence_findings_analysis_idx" ON "intelligence_findings"("analysis_id");
    CREATE INDEX IF NOT EXISTS "intelligence_findings_target_idx" ON "intelligence_findings"("target_type", "target_id");

    -- 6. Intelligence Recommendations
    CREATE TABLE IF NOT EXISTS "intelligence_recommendations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "analysis_id" uuid NOT NULL REFERENCES "intelligence_analyses"("id") ON DELETE CASCADE,
      "finding_id" uuid REFERENCES "intelligence_findings"("id") ON DELETE SET NULL,
      "target_collection" varchar NOT NULL DEFAULT 'content',
      "target_id" varchar NOT NULL,
      "is_proposal" boolean NOT NULL DEFAULT true,
      "nature" varchar NOT NULL DEFAULT 'deterministic',
      "action" varchar NOT NULL,
      "current_value" jsonb,
      "proposed_value" jsonb NOT NULL,
      "rationale" text NOT NULL,
      "validation_status" varchar NOT NULL DEFAULT 'valid',
      "validation_issues" jsonb DEFAULT '[]'::jsonb,
      "status" varchar NOT NULL DEFAULT 'pending',
      "rejection_reason" text,
      "decided_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "decided_at" timestamptz,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "intelligence_recommendations_site_idx" ON "intelligence_recommendations"("site_id");
    CREATE INDEX IF NOT EXISTS "intelligence_recommendations_analysis_idx" ON "intelligence_recommendations"("analysis_id");
    CREATE INDEX IF NOT EXISTS "intelligence_recommendations_target_idx" ON "intelligence_recommendations"("target_collection", "target_id");

    -- 7. Intelligence Executions
    CREATE TABLE IF NOT EXISTS "intelligence_executions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "recommendation_id" uuid NOT NULL REFERENCES "intelligence_recommendations"("id") ON DELETE CASCADE,
      "target_collection" varchar NOT NULL,
      "target_id" varchar NOT NULL,
      "executed_at" timestamptz NOT NULL,
      "executed_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "before_snapshot" jsonb NOT NULL,
      "after_snapshot" jsonb NOT NULL,
      "status" varchar NOT NULL DEFAULT 'applied',
      "reverted_at" timestamptz,
      "reverted_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "intelligence_executions_site_idx" ON "intelligence_executions"("site_id");
    CREATE INDEX IF NOT EXISTS "intelligence_executions_rec_idx" ON "intelligence_executions"("recommendation_id");
    CREATE INDEX IF NOT EXISTS "intelligence_executions_target_idx" ON "intelligence_executions"("target_collection", "target_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "intelligence_executions";
    DROP TABLE IF EXISTS "intelligence_recommendations";
    DROP TABLE IF EXISTS "intelligence_findings";
    DROP TABLE IF EXISTS "intelligence_analyses";
    DROP TABLE IF EXISTS "intelligence_citations";
    DROP TABLE IF EXISTS "intelligence_claims";
    DROP TABLE IF EXISTS "intelligence_entities_rels";
    DROP TABLE IF EXISTS "intelligence_entities";
  `)
}

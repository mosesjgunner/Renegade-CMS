import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TYPE "public"."enum_users_role" ADD VALUE IF NOT EXISTS 'administrator';
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "member_id" uuid;
    CREATE UNIQUE INDEX IF NOT EXISTS "users_member_idx" ON "users" USING btree ("member_id");
    CREATE TABLE IF NOT EXISTS "team_memberships" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "member_id" uuid NOT NULL,
      "role" varchar NOT NULL,
      "grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "status" varchar DEFAULT 'active' NOT NULL,
      "accepted_at" timestamp(3) with time zone,
      "revoked_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "team_invitations" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "email_hash" varchar NOT NULL,
      "token_hash" varchar NOT NULL,
      "role" varchar NOT NULL,
      "grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "accepted_at" timestamp(3) with time zone,
      "accepted_by_id" uuid,
      "revoked_at" timestamp(3) with time zone,
      "created_by_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "team_audit_events" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "action" varchar NOT NULL,
      "actor_member_id" uuid,
      "subject_member_id" uuid,
      "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "editorial_assignments" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "content_id" uuid NOT NULL,
      "article_id" uuid,
      "revision_id" uuid,
      "title" varchar NOT NULL,
      "assignee_id" uuid NOT NULL,
      "assigned_by_id" uuid NOT NULL,
      "due_at" timestamp(3) with time zone,
      "status" varchar DEFAULT 'open' NOT NULL,
      "metadata" jsonb DEFAULT '{}'::jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "editorial_discussions" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "content_id" uuid NOT NULL,
      "article_id" uuid,
      "revision_id" uuid,
      "subject" varchar NOT NULL,
      "state" varchar DEFAULT 'open' NOT NULL,
      "opened_by_id" uuid NOT NULL,
      "resolved_by_id" uuid,
      "resolved_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "editorial_comments" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "discussion_id" uuid NOT NULL,
      "author_id" uuid NOT NULL,
      "body" varchar NOT NULL,
      "reply_to_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "editorial_comments_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL,
      "path" varchar NOT NULL,
      "members_id" uuid
    );
    CREATE TABLE IF NOT EXISTS "work_conversations" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "title" varchar NOT NULL,
      "content_id" uuid,
      "article_id" uuid,
      "revision_id" uuid,
      "status" varchar DEFAULT 'open' NOT NULL,
      "private_only" boolean DEFAULT true NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "work_conversations_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL,
      "path" varchar NOT NULL,
      "members_id" uuid
    );
    CREATE TABLE IF NOT EXISTS "work_messages" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "conversation_id" uuid NOT NULL,
      "author_id" uuid NOT NULL,
      "body" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "work_messages_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL,
      "path" varchar NOT NULL,
      "members_id" uuid
    );

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "team_memberships_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "team_invitations_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "team_audit_events_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "editorial_assignments_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "editorial_discussions_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "editorial_comments_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "work_conversations_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "work_messages_id" uuid;

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "users_id" uuid;

    CREATE UNIQUE INDEX IF NOT EXISTS "team_memberships_scope_key_member_idx" ON "team_memberships" USING btree ("scope_key", "member_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_token_hash_idx" ON "team_invitations" USING btree ("token_hash");
    CREATE INDEX IF NOT EXISTS "team_invitations_email_hash_idx" ON "team_invitations" USING btree ("email_hash");
    CREATE INDEX IF NOT EXISTS "team_audit_events_scope_key_idx" ON "team_audit_events" USING btree ("scope_key");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    DROP TABLE IF EXISTS "work_messages_rels" CASCADE;
    DROP TABLE IF EXISTS "work_messages" CASCADE;
    DROP TABLE IF EXISTS "work_conversations_rels" CASCADE;
    DROP TABLE IF EXISTS "work_conversations" CASCADE;
    DROP TABLE IF EXISTS "editorial_comments_rels" CASCADE;
    DROP TABLE IF EXISTS "editorial_comments" CASCADE;
    DROP TABLE IF EXISTS "editorial_discussions" CASCADE;
    DROP TABLE IF EXISTS "editorial_assignments" CASCADE;
    DROP TABLE IF EXISTS "team_audit_events" CASCADE;
    DROP TABLE IF EXISTS "team_invitations" CASCADE;
    DROP TABLE IF EXISTS "team_memberships" CASCADE;
    DROP INDEX IF EXISTS "users_member_idx";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "member_id";
  `)
}

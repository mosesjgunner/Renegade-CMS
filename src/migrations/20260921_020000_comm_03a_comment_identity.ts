import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-03A: canonical content comment identity and durable thread tree. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- PostgreSQL has no built-in UUIDv7 generator on all supported versions.
    -- Keep generation local and time-sortable instead of silently using UUIDv4.
    CREATE OR REPLACE FUNCTION "renegade_uuid_v7"() RETURNS uuid
    LANGUAGE sql VOLATILE AS $$
      SELECT (
        lpad(to_hex(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint), 12, '0') ||
        '-7' || substr(encode(gen_random_bytes(10), 'hex'), 1, 3) ||
        '-' || substr(encode(gen_random_bytes(10), 'hex'), 4, 4) ||
        '-8' || substr(encode(gen_random_bytes(10), 'hex'), 8, 3) ||
        '-' || substr(encode(gen_random_bytes(10), 'hex'), 1, 12)
      )::uuid;
    $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_comments_author_type" AS ENUM ('member', 'anonymous', 'system');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_comments_status" AS ENUM ('visible', 'pending_review', 'rejected', 'deleted');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS "comment_threads" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "canonical_content_id" uuid NOT NULL REFERENCES "content"("id") ON DELETE CASCADE,
      "content_type" varchar(128) NOT NULL,
      "is_closed" boolean NOT NULL DEFAULT false,
      "is_frozen" boolean NOT NULL DEFAULT false,
      "premoderation_enabled" boolean NOT NULL DEFAULT false,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "comment_threads_site_content_unique" UNIQUE ("site_id", "canonical_content_id")
    );
    CREATE INDEX IF NOT EXISTS "comment_threads_content_idx" ON "comment_threads" ("canonical_content_id");

    CREATE TABLE IF NOT EXISTS "comments" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "thread_id" uuid NOT NULL REFERENCES "comment_threads"("id") ON DELETE CASCADE,
      "parent_id" uuid REFERENCES "comments"("id") ON DELETE RESTRICT,
      "root_id" uuid REFERENCES "comments"("id") ON DELETE RESTRICT,
      "author_id" uuid NOT NULL,
      "author_type" "enum_comments_author_type" NOT NULL,
      "status" "enum_comments_status" NOT NULL DEFAULT 'visible',
      "depth" integer NOT NULL DEFAULT 0 CHECK ("depth" >= 0 AND "depth" <= 5),
      "body_raw" text NOT NULL,
      "body_html" text NOT NULL,
      "client_mutation_id" uuid,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "deleted_at" timestamp(3) with time zone,
      CONSTRAINT "comments_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
    );
    CREATE INDEX IF NOT EXISTS "comments_thread_created_idx" ON "comments" ("thread_id", "created_at");
    CREATE INDEX IF NOT EXISTS "comments_parent_idx" ON "comments" ("parent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "comments_client_mutation_unique"
      ON "comments" ("thread_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;

    CREATE TABLE IF NOT EXISTS "comment_revisions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "comment_id" uuid NOT NULL REFERENCES "comments"("id") ON DELETE CASCADE,
      "editor_id" uuid NOT NULL,
      "previous_body_raw" text NOT NULL,
      "reason" text,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "comment_revisions_comment_created_idx"
      ON "comment_revisions" ("comment_id", "created_at");

    -- A foreign key cannot express that the content belongs to the same site.
    CREATE OR REPLACE FUNCTION "validate_comment_thread_content"() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "content" c
        WHERE c."id" = NEW."canonical_content_id" AND c."site_id" = NEW."site_id"
      ) THEN
        RAISE EXCEPTION 'canonical content % does not belong to site %', NEW."canonical_content_id", NEW."site_id"
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS "comment_threads_content_scope" ON "comment_threads";
    CREATE TRIGGER "comment_threads_content_scope"
      BEFORE INSERT OR UPDATE OF "site_id", "canonical_content_id" ON "comment_threads"
      FOR EACH ROW EXECUTE FUNCTION "validate_comment_thread_content"();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "comment_revisions";
    DROP TABLE IF EXISTS "comments";
    DROP TABLE IF EXISTS "comment_threads";
    DROP FUNCTION IF EXISTS "validate_comment_thread_content"();
    DROP TYPE IF EXISTS "public"."enum_comments_status";
    DROP TYPE IF EXISTS "public"."enum_comments_author_type";
    DROP FUNCTION IF EXISTS "renegade_uuid_v7"();
  `)
}

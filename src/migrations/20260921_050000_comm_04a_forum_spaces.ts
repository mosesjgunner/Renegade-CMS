import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-04A: site-scoped forum spaces and their explicit membership boundary. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_forum_spaces_visibility" AS ENUM
        ('public', 'member_only', 'private', 'hidden');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_forum_spaces_join_policy" AS ENUM
        ('open', 'request_approval', 'invite_only');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_space_memberships_role" AS ENUM
        ('viewer', 'contributor', 'moderator', 'administrator');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_space_memberships_status" AS ENUM
        ('active', 'pending', 'invited');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS "forum_spaces" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "parent_id" uuid REFERENCES "forum_spaces"("id") ON DELETE RESTRICT,
      "name" varchar(256) NOT NULL,
      "slug" varchar(160) NOT NULL,
      "description" text,
      "visibility" "enum_forum_spaces_visibility" NOT NULL DEFAULT 'public',
      "join_policy" "enum_forum_spaces_join_policy" NOT NULL DEFAULT 'open',
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "forum_spaces_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
      CONSTRAINT "forum_spaces_site_slug_unique" UNIQUE ("site_id", "slug")
    );
    CREATE INDEX IF NOT EXISTS "forum_spaces_site_parent_idx" ON "forum_spaces" ("site_id", "parent_id");

    -- The hierarchy is deliberately shallow: a root may have children, but no grandchildren.
    CREATE OR REPLACE FUNCTION "validate_forum_space_parent"() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."parent_id" IS NULL THEN
        RETURN NEW;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "forum_spaces" parent
        WHERE parent."id" = NEW."parent_id"
          AND parent."site_id" = NEW."site_id"
          AND parent."parent_id" IS NULL
      ) THEN
        RAISE EXCEPTION 'forum space parent must be a root in the same site'
          USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM "forum_spaces" child WHERE child."parent_id" = NEW."id") THEN
        RAISE EXCEPTION 'forum spaces support only one parent level'
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS "forum_spaces_parent_scope" ON "forum_spaces";
    CREATE TRIGGER "forum_spaces_parent_scope"
      BEFORE INSERT OR UPDATE OF "site_id", "parent_id" ON "forum_spaces"
      FOR EACH ROW EXECUTE FUNCTION "validate_forum_space_parent"();

    CREATE TABLE IF NOT EXISTS "space_memberships" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "space_id" uuid NOT NULL REFERENCES "forum_spaces"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "role" "enum_space_memberships_role" NOT NULL DEFAULT 'viewer',
      "status" "enum_space_memberships_status" NOT NULL DEFAULT 'active',
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "space_memberships_space_member_unique" UNIQUE ("space_id", "member_id")
    );
    CREATE INDEX IF NOT EXISTS "space_memberships_member_idx" ON "space_memberships" ("member_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "space_memberships";
    DROP TRIGGER IF EXISTS "forum_spaces_parent_scope" ON "forum_spaces";
    DROP TABLE IF EXISTS "forum_spaces";
    DROP FUNCTION IF EXISTS "validate_forum_space_parent"();
    DROP TYPE IF EXISTS "public"."enum_space_memberships_status";
    DROP TYPE IF EXISTS "public"."enum_space_memberships_role";
    DROP TYPE IF EXISTS "public"."enum_forum_spaces_join_policy";
    DROP TYPE IF EXISTS "public"."enum_forum_spaces_visibility";
  `)
}

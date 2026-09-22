import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-01: member authentication and account-lifecycle persistence. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'restricted';
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'suspended';
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'deactivated';
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'deletion-pending';
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'deleted';
    ALTER TYPE "public"."enum_identity_tokens_purpose" ADD VALUE IF NOT EXISTS 'passkey-registration';
    ALTER TYPE "public"."enum_identity_tokens_purpose" ADD VALUE IF NOT EXISTS 'passkey-authentication';

    ALTER TABLE "members" ALTER COLUMN "status" SET DEFAULT 'pending';
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "restricted_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "deletion_pending_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "state_reason" text;

    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "handle_changed_at" timestamp(3) with time zone;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "handle_history" jsonb;

    ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "community_registration_policy" varchar DEFAULT 'open' NOT NULL;

    DO $$
    BEGIN
      CREATE TYPE "public"."enum_member_site_roles_role" AS ENUM ('member', 'trusted', 'contributor', 'moderator', 'community-manager');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "member_site_roles" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "public"."members"("id") ON DELETE CASCADE,
      "role" "enum_member_site_roles_role" DEFAULT 'member' NOT NULL,
      "granted_by_user_id" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "member_site_roles_site_idx" ON "member_site_roles" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "member_site_roles_member_idx" ON "member_site_roles" USING btree ("member_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "member_site_roles_site_member_idx" ON "member_site_roles" USING btree ("site_id", "member_id");

    -- Payload's document-lock relation is a polymorphic table with one column
    -- per registered collection. Registering a collection without this column
    -- breaks every locked-document lookup, including unrelated publication
    -- writes. Keep it additive for upgrades as well as fresh installs.
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "member_site_roles_id" uuid;
    DO $$
    BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_member_site_roles_fk"
        FOREIGN KEY ("member_site_roles_id") REFERENCES "public"."member_site_roles"("id")
        ON DELETE CASCADE ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_member_site_roles_id_idx"
      ON "payload_locked_documents_rels" USING btree ("member_site_roles_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_member_site_roles_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_member_site_roles_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "member_site_roles_id";
    DROP TABLE IF EXISTS "member_site_roles";
    DROP TYPE IF EXISTS "public"."enum_member_site_roles_role";
    ALTER TABLE "members" ALTER COLUMN "status" SET DEFAULT 'active';
    ALTER TABLE "sites" DROP COLUMN IF EXISTS "community_registration_policy";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "handle_history", DROP COLUMN IF EXISTS "handle_changed_at";
    ALTER TABLE "members"
      DROP COLUMN IF EXISTS "state_reason",
      DROP COLUMN IF EXISTS "deleted_at",
      DROP COLUMN IF EXISTS "deletion_pending_at",
      DROP COLUMN IF EXISTS "deactivated_at",
      DROP COLUMN IF EXISTS "suspended_at",
      DROP COLUMN IF EXISTS "restricted_at";
  `)
}

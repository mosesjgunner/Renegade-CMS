import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-03C: raw member reactions with rebuildable per-comment counter projections. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "comment_reaction_codes" jsonb NOT NULL
      DEFAULT '["thumbs_up", "heart", "insightful", "applause"]'::jsonb;

    CREATE TABLE IF NOT EXISTS "comment_reactions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "comment_id" uuid NOT NULL REFERENCES "comments"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "reaction_code" varchar(64) NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "comment_reactions_unique" UNIQUE ("comment_id", "member_id", "reaction_code")
    );
    CREATE INDEX IF NOT EXISTS "comment_reactions_comment_code_idx"
      ON "comment_reactions" ("comment_id", "reaction_code");

    -- This table is deliberately a projection. comment_reactions remains authoritative.
    CREATE TABLE IF NOT EXISTS "comment_reaction_counters" (
      "comment_id" uuid NOT NULL REFERENCES "comments"("id") ON DELETE CASCADE,
      "reaction_code" varchar(64) NOT NULL,
      "reaction_count" integer NOT NULL DEFAULT 0 CHECK ("reaction_count" >= 0),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY ("comment_id", "reaction_code")
    );
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "comment_reaction_counters";
    DROP TABLE IF EXISTS "comment_reactions";
    ALTER TABLE "sites" DROP COLUMN IF EXISTS "comment_reaction_codes";
  `)
}

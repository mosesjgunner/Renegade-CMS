import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    DO $$ BEGIN CREATE TYPE "public"."enum_public_redirects_match" AS ENUM ('exact', 'prefix', 'regex'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_public_redirects_status_code" AS ENUM ('301', '302', '307', '308'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE IF NOT EXISTS "public_redirects" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "from_path" varchar NOT NULL, "to_path" varchar NOT NULL, "match" "enum_public_redirects_match" DEFAULT 'exact' NOT NULL,
      "status_code" "enum_public_redirects_status_code" DEFAULT '308' NOT NULL, "preserve_query" boolean DEFAULT true, "enabled" boolean DEFAULT true,
      "hit_count" numeric DEFAULT 0 NOT NULL, "last_hit_at" timestamp(3) with time zone, "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "public_redirects_site_from_path_idx" ON "public_redirects" ("site_id", "from_path");
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    `DROP TABLE IF EXISTS "public_redirects" CASCADE; DROP TYPE IF EXISTS "public"."enum_public_redirects_match"; DROP TYPE IF EXISTS "public"."enum_public_redirects_status_code";`,
  )
}

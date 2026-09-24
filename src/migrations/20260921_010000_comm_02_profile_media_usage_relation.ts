import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** COMM-02: profile is a governed polymorphic media usage target. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "profiles_id" uuid;
    DO $$
    BEGIN
      ALTER TABLE "media_usages_rels"
        ADD CONSTRAINT "media_usages_rels_profiles_fk"
        FOREIGN KEY ("profiles_id") REFERENCES "profiles"("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_profiles_id_idx"
      ON "media_usages_rels" USING btree ("profiles_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_profiles_fk";
    DROP INDEX IF EXISTS "media_usages_rels_profiles_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "profiles_id";
  `)
}

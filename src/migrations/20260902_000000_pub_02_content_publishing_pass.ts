import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** PUB-02 is additive: existing article documents are copied into content.body. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "path_override" boolean DEFAULT false NOT NULL;
    ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "parent_page_id" uuid;
    ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "page_template" varchar DEFAULT 'standard';
    ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "body" jsonb;

    UPDATE "content" AS c
    SET "body" = COALESCE(a."document" -> 'document', a."document")
    FROM "article_family_content" AS a
    WHERE a."content_id" = c."id" AND c."body" IS NULL;

    DROP INDEX IF EXISTS "content_canonical_path_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "content_site_canonical_path_idx"
      ON "content" USING btree ("site_id", "canonical_path");
    CREATE INDEX IF NOT EXISTS "content_parent_page_idx" ON "content" USING btree ("parent_page_id");
    DO $$ BEGIN
      ALTER TABLE "content" ADD CONSTRAINT "content_parent_page_id_content_id_fk"
        FOREIGN KEY ("parent_page_id") REFERENCES "public"."content"("id") ON DELETE restrict ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error('PUB-02 migrates canonical bodies; rollback requires a reviewed export.')
}

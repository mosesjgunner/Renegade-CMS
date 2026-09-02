import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Additive long-form identity and operator Quality Center lifecycle fields. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_quality_scans_target_type" ADD VALUE IF NOT EXISTS 'book';
    ALTER TYPE "public"."enum_quality_scans_target_type" ADD VALUE IF NOT EXISTS 'book-chapter';
    ALTER TYPE "public"."enum_quality_scans_status" ADD VALUE IF NOT EXISTS 'stale';
    ALTER TYPE "public"."enum_quality_issues_status" ADD VALUE IF NOT EXISTS 'ignored';
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft' NOT NULL;
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "visibility" varchar DEFAULT 'public' NOT NULL;
    ALTER TABLE "book_chapters" ADD COLUMN IF NOT EXISTS "slug" varchar;
    ALTER TABLE "book_chapters" ADD COLUMN IF NOT EXISTS "canonical_path" varchar;
    ALTER TABLE "book_chapters" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft' NOT NULL;
    ALTER TABLE "book_chapters" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    UPDATE "book_chapters" SET "slug" = 'chapter-' || replace("id"::text, '-', '') WHERE "slug" IS NULL;
    UPDATE "book_chapters" c SET "canonical_path" = b."canonical_path" || '/' || c."slug" FROM "books" b WHERE c."book_id" = b."id" AND c."canonical_path" IS NULL;
    ALTER TABLE "book_chapters" ALTER COLUMN "slug" SET NOT NULL;
    ALTER TABLE "book_chapters" ALTER COLUMN "canonical_path" SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "book_chapters_canonical_path_idx" ON "book_chapters" USING btree ("canonical_path");
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "repair_url" varchar;
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "ignored_at" timestamp(3) with time zone;
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "ignored_reason" varchar;
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    '20260831_130000_books_quality_center is additive; rollback requires a reviewed data migration.',
  )
}

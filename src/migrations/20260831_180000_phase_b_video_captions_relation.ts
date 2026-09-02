import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Adds the Payload has-many relation table used by Videos.captions. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "videos_rels" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE cascade,
      "path" varchar NOT NULL,
      "media_assets_id" uuid REFERENCES "media_assets"("id") ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS "videos_rels_parent_idx" ON "videos_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "videos_rels_media_assets_idx" ON "videos_rels" ("media_assets_id");
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Phase B video captions relation is additive; rollback requires a reviewed data migration.',
  )
}

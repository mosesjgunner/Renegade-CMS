import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Reconciles lifecycle fields inherited from MediaPublishing's shared scoped() definition. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
  `)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  throw new Error('Phase B media lifecycle fields are additive; rollback requires a reviewed data migration.')
}

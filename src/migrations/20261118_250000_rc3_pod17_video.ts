import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-17 (POD-REQ-36, bounded): video podcast.
 *
 * - `podcast_episodes` gain `video_id` (the attached video render's
 *   media asset; FK to media_assets, ON DELETE SET NULL like
 *   `audio_id`) and `video_provenance` (jsonb: the POD-17 attach's
 *   probe report — { kind, mode, assetId, probe: { passed,
 *   durationSec, width, height, videoCodec, audioCodec,
 *   checksumSha256 }, audioDurationSec, durationDeltaSec,
 *   renderedAt }). The feed publishes a video enclosure only when
 *   both are present and the probe passed for the attached bytes.
 *
 * Rollback note: `down` drops exactly those two columns — the video
 * asset/bytes survive, orphaned; episodes lose the video binding and
 * probe provenance and render as audio-only until a re-migrate and
 * re-attach.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "video_id" uuid;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "video_provenance" jsonb;
    DO $$ BEGIN
      ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_video_id_media_assets_id_fk" FOREIGN KEY ("video_id") REFERENCES "media_assets"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_episodes" DROP CONSTRAINT IF EXISTS "podcast_episodes_video_id_media_assets_id_fk";
    ALTER TABLE "podcast_episodes" DROP COLUMN IF EXISTS "video_id";
    ALTER TABLE "podcast_episodes" DROP COLUMN IF EXISTS "video_provenance";
  `)
}

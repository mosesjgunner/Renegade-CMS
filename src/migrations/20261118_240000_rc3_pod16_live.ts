import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-16 (POD-REQ-34, POD-REQ-35): live output.
 *
 * - `podcast_shows` gain `stream_profile` (jsonb: the Icecast stream
 *   profile — sourceUrl/bitrateKbps/title/enabled/nowPlayingEnabled;
 *   credential keys are refused by the collection validator),
 *   `stream_credential_env_name` (varchar: the NAME of the env var
 *   holding the source password — never the value) and
 *   `stream_credential_encrypted` (varchar: AES-256-GCM envelope of
 *   the source password; the Payload field has read access off, so
 *   the API never returns even the envelope).
 * - `podcast_episodes` gain `live_room` (jsonb: the audience room
 *   binding { roomId, access } — data only; the community rooms
 *   machinery is not in this tree yet, see
 *   src/modules/podcast-studio/live/live-room.ts).
 *
 * Rollback note: `down` drops exactly those columns — discarding
 * stream profiles, credential storage (shows lose their stored
 * source password and must be re-configured after a re-migrate) and
 * room bindings.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "stream_profile" jsonb;
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "stream_credential_env_name" varchar;
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "stream_credential_encrypted" varchar;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "live_room" jsonb;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_shows" DROP COLUMN IF EXISTS "stream_profile";
    ALTER TABLE "podcast_shows" DROP COLUMN IF EXISTS "stream_credential_env_name";
    ALTER TABLE "podcast_shows" DROP COLUMN IF EXISTS "stream_credential_encrypted";
    ALTER TABLE "podcast_episodes" DROP COLUMN IF EXISTS "live_room";
  `)
}

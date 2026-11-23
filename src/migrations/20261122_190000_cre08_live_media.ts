import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS live_media_sessions (
      id uuid PRIMARY KEY,
      room_id uuid NOT NULL REFERENCES room_bindings(conversation_id) ON DELETE CASCADE,
      host_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
      provider text NOT NULL CHECK (provider IN ('mediamtx','cloudflare')),
      provider_ref text NOT NULL,
      state text NOT NULL DEFAULT 'starting' CHECK (state IN ('starting','live','reconnecting','ended')),
      recording boolean NOT NULL DEFAULT false,
      access_version integer NOT NULL DEFAULT 1,
      started_at timestamptz NOT NULL DEFAULT now(),
      went_live_at timestamptz,
      ended_at timestamptz,
      last_checked_at timestamptz,
      provider_stopped_at timestamptz,
      revoked_at timestamptz,
      UNIQUE (provider, provider_ref)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS live_media_one_active_room ON live_media_sessions(room_id)
      WHERE ended_at IS NULL OR provider_stopped_at IS NULL;
    CREATE INDEX IF NOT EXISTS live_media_room_history ON live_media_sessions(room_id,started_at DESC);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM live_media_sessions) THEN
        RAISE EXCEPTION 'Cannot remove live media session records.';
      END IF;
    END $$;
    DROP TABLE IF EXISTS live_media_sessions;
  `)
}

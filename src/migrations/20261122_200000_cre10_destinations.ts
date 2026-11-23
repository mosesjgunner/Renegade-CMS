import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs) {
  await db.execute(sql`
    CREATE VIEW live_destination_public_rooms AS
      SELECT b.conversation_id AS room_id FROM room_bindings b
      WHERE b.mode='theater' AND b.access_policy='public' AND b.group_id IS NULL
        AND b.content_id IS NULL AND b.event_id IS NULL AND NOT b.event_restricted
        AND NOT EXISTS (SELECT 1 FROM podcast_episodes e WHERE e.site_id=b.site_id AND lower(e.live_room->>'roomId')=b.conversation_id::text)
        AND EXISTS (SELECT 1 FROM room_audience(b.conversation_id,NULL) WHERE can_read);
    CREATE TABLE live_destinations (
      id uuid PRIMARY KEY,
      room_id uuid NOT NULL REFERENCES room_bindings(conversation_id) ON DELETE CASCADE,
      provider text NOT NULL CHECK (provider IN ('custom','youtube','twitch')),
      privacy text NOT NULL CHECK (privacy IN ('public','unlisted','private')),
      terms_version integer NOT NULL,
      retry_budget integer NOT NULL CHECK (retry_budget BETWEEN 0 AND 3),
      byte_limit bigint NOT NULL CHECK (byte_limit > 0),
      seconds_limit integer NOT NULL CHECK (seconds_limit > 0),
      probe text NOT NULL DEFAULT 'untested',
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz
    );
    CREATE TABLE live_destination_credentials (
      destination_id uuid PRIMARY KEY REFERENCES live_destinations(id) ON DELETE CASCADE,
      credential bytea NOT NULL
    );
    CREATE INDEX live_destinations_room ON live_destinations(room_id,created_at);
    CREATE TABLE live_destination_runs (
      id uuid PRIMARY KEY,
      destination_id uuid NOT NULL REFERENCES live_destinations(id) ON DELETE CASCADE,
      session_id uuid NOT NULL REFERENCES live_media_sessions(id) ON DELETE CASCADE,
      idempotency_key uuid NOT NULL,
      status text NOT NULL DEFAULT 'queued',
      attempt integer NOT NULL DEFAULT 0,
      bytes_sent bigint NOT NULL DEFAULT 0,
      remote_id uuid,
      deadline timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      stop_requested boolean NOT NULL DEFAULT false,
      UNIQUE(destination_id,idempotency_key)
    );
    CREATE UNIQUE INDEX live_destination_active_run ON live_destination_runs(destination_id)
      WHERE status IN ('queued','connecting','sending','retrying');
    CREATE TABLE live_destination_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      destination_id uuid NOT NULL REFERENCES live_destinations(id) ON DELETE CASCADE,
      run_id uuid REFERENCES live_destination_runs(id) ON DELETE CASCADE,
      actor_id uuid REFERENCES members(id) ON DELETE SET NULL,
      event text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX live_destination_audit_history ON live_destination_audit(destination_id,id DESC);
  `)
}

export async function down({ db }: MigrateDownArgs) {
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM live_destinations) THEN
        RAISE EXCEPTION 'Cannot remove live destination history.';
      END IF;
    END $$;
    DROP VIEW live_destination_public_rooms;
    DROP TABLE live_destination_audit,live_destination_runs,live_destination_credentials,live_destinations;
  `)
}

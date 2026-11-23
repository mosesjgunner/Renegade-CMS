import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs) {
  await db.execute(sql`
    CREATE TABLE live_events (
      room_id uuid PRIMARY KEY REFERENCES room_bindings(conversation_id) ON DELETE CASCADE,
      title text NOT NULL,
      starts_at timestamptz NOT NULL,
      time_zone text NOT NULL,
      source text NOT NULL CHECK (source IN ('broadcast','premiere','external')),
      provider_url text,
      rsvp_enabled boolean NOT NULL DEFAULT false,
      announcement text NOT NULL DEFAULT '',
      session_id uuid UNIQUE REFERENCES live_media_sessions(id) ON DELETE SET NULL,
      ended_at timestamptz,
      replay_drafted_at timestamptz,
      replay_published_at timestamptz,
      CHECK (replay_published_at IS NULL OR replay_drafted_at IS NOT NULL)
    );
    CREATE TABLE live_event_rsvps (
      room_id uuid NOT NULL REFERENCES live_events(room_id) ON DELETE CASCADE,
      member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      PRIMARY KEY (room_id,member_id)
    );
  `)
}

export async function down({ db }: MigrateDownArgs) {
  await db.execute(sql`DROP TABLE live_event_rsvps; DROP TABLE live_events;`)
}

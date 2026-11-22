import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * RC3-15B: groups (COM-GRP-1) and rooms (Circles D3/D4).
 *
 * Groups are the greenfield entity the community contract §5 specifies.
 * Rooms are conversations plus a binding; their audiences are DERIVED
 * from current group membership / site standing / event attendance —
 * never copied into conversation_memberships (PT-K1). The SQL function
 * room_audience() is the database-level mirror of the JS audience
 * function in src/modules/community/rooms.ts: the message insert guard
 * and the moderation-report snapshot consult it so bound rooms follow
 * the same contract as the service layer.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "groups" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "name" varchar(200) NOT NULL,
      "slug" varchar(120) NOT NULL,
      "description" text,
      "cover_media_id" uuid,
      "privacy" varchar(20) NOT NULL DEFAULT 'public' CHECK ("privacy" IN ('public','private-visible','private-hidden')),
      "join_mode" varchar(12) NOT NULL DEFAULT 'open' CHECK ("join_mode" IN ('open','request','invite')),
      "join_questions" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_by_member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "status" varchar(12) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','archived')),
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "groups_site_slug_unique" UNIQUE ("site_id", "slug")
    );
    CREATE INDEX IF NOT EXISTS "groups_site_status_idx" ON "groups" ("site_id", "status");

    CREATE TABLE IF NOT EXISTS "group_memberships" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "role" varchar(12) NOT NULL DEFAULT 'member' CHECK ("role" IN ('owner','admin','moderator','member')),
      "status" varchar(12) NOT NULL DEFAULT 'active' CHECK ("status" IN ('invited','pending','active','removed','banned')),
      "answers" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "invited_by_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "group_memberships_group_member_unique" UNIQUE ("group_id", "member_id")
    );
    CREATE INDEX IF NOT EXISTS "group_memberships_member_idx" ON "group_memberships" ("member_id", "status");

    CREATE TABLE IF NOT EXISTS "group_audit_entries" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
      "actor_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "action" varchar(64) NOT NULL,
      "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "group_audit_entries_group_idx" ON "group_audit_entries" ("group_id", "created_at");

    CREATE TABLE IF NOT EXISTS "room_bindings" (
      "conversation_id" uuid PRIMARY KEY REFERENCES "conversations"("id") ON DELETE CASCADE,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "group_id" uuid REFERENCES "groups"("id") ON DELETE CASCADE,
      "event_id" uuid REFERENCES "calendar_entries"("id") ON DELETE SET NULL,
      "event_restricted" boolean NOT NULL DEFAULT false,
      "lifecycle" varchar(10) NOT NULL DEFAULT 'open' CHECK ("lifecycle" IN ('open','closed')),
      "history_policy" varchar(10) NOT NULL DEFAULT 'all' CHECK ("history_policy" IN ('all','from-join')),
      "created_by_member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "room_bindings_group_idx" ON "room_bindings" ("group_id");

    CREATE TABLE IF NOT EXISTS "room_event_attendees" (
      "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      PRIMARY KEY ("conversation_id", "member_id")
    );

    CREATE TABLE IF NOT EXISTS "room_read_states" (
      "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "history_floor_sequence" integer NOT NULL DEFAULT 1 CHECK ("history_floor_sequence" >= 1),
      "last_read_sequence" integer NOT NULL DEFAULT 0 CHECK ("last_read_sequence" >= 0),
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY ("conversation_id", "member_id")
    );

    CREATE TABLE IF NOT EXISTS "room_recaps" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "source_conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
      "destination_group_id" uuid REFERENCES "groups"("id") ON DELETE CASCADE,
      "author_member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "title" varchar(200) NOT NULL,
      "body" text NOT NULL DEFAULT '',
      "status" varchar(12) NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','published','blocked')),
      "blocked_reason" text,
      "approved_by_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "published_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "room_recaps_destination_idx" ON "room_recaps" ("destination_group_id", "status");

    CREATE TABLE IF NOT EXISTS "room_recap_quotes" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "recap_id" uuid NOT NULL REFERENCES "room_recaps"("id") ON DELETE CASCADE,
      "source_message_id" uuid REFERENCES "messages"("id") ON DELETE SET NULL,
      "source_sequence" integer NOT NULL,
      "position" integer NOT NULL,
      CONSTRAINT "room_recap_quotes_recap_message_unique" UNIQUE ("recap_id", "source_message_id")
    );

    CREATE OR REPLACE FUNCTION "room_audience"(p_conversation uuid, p_member uuid)
    RETURNS TABLE (can_read boolean, can_write boolean, audience_role text)
    LANGUAGE plpgsql STABLE AS $$
    DECLARE
      v_binding "room_bindings"%ROWTYPE;
      v_group "groups"%ROWTYPE;
      v_member_status text;
      v_group_role text;
      v_read boolean := false;
      v_write boolean := false;
      v_role text := NULL;
    BEGIN
      SELECT * INTO v_binding FROM "room_bindings" WHERE "conversation_id" = p_conversation;
      IF NOT FOUND THEN RETURN; END IF;
      SELECT "status" INTO v_member_status FROM "members" WHERE "id" = p_member;
      IF v_member_status IS NULL OR v_member_status NOT IN ('active', 'restricted') THEN RETURN; END IF;
      IF v_binding."group_id" IS NOT NULL THEN
        SELECT "role" INTO v_group_role FROM "group_memberships"
          WHERE "group_id" = v_binding."group_id" AND "member_id" = p_member AND "status" = 'active';
        IF v_group_role IS NOT NULL THEN
          v_read := true;
          v_write := v_member_status = 'active';
          v_role := v_group_role;
        ELSE
          SELECT * INTO v_group FROM "groups" WHERE "id" = v_binding."group_id";
          IF FOUND AND v_group."privacy" = 'public' AND EXISTS (
            SELECT 1 FROM "member_site_roles" WHERE "site_id" = v_binding."site_id" AND "member_id" = p_member
          ) THEN
            v_read := true;
            v_write := false;
            v_role := 'guest';
          ELSE
            RETURN;
          END IF;
        END IF;
      ELSE
        IF EXISTS (SELECT 1 FROM "member_site_roles" WHERE "site_id" = v_binding."site_id" AND "member_id" = p_member) THEN
          v_read := true;
          v_write := v_member_status = 'active';
          v_role := 'member';
        ELSE
          RETURN;
        END IF;
      END IF;
      IF v_binding."event_restricted" THEN
        IF EXISTS (SELECT 1 FROM "room_event_attendees" WHERE "conversation_id" = p_conversation AND "member_id" = p_member) THEN
          NULL; -- attendee: keep current grants
        ELSIF v_role IN ('owner', 'admin', 'moderator') THEN
          v_write := false; -- staff oversight: read-only (PT-K1 prototype decision)
        ELSE
          RETURN; -- the event restriction narrowed this member out
        END IF;
      END IF;
      IF v_binding."lifecycle" = 'closed' THEN v_write := false; END IF;
      can_read := v_read;
      can_write := v_write;
      audience_role := v_role;
      RETURN NEXT;
    END $$;

    CREATE OR REPLACE FUNCTION "room_history_floor"(p_conversation uuid, p_member uuid)
    RETURNS integer LANGUAGE plpgsql STABLE AS $$
    DECLARE
      v_floor integer;
      v_policy text;
      v_next integer;
    BEGIN
      SELECT "history_floor_sequence" INTO v_floor FROM "room_read_states"
        WHERE "conversation_id" = p_conversation AND "member_id" = p_member;
      IF v_floor IS NOT NULL THEN RETURN v_floor; END IF;
      SELECT b."history_policy", c."next_message_sequence" INTO v_policy, v_next
        FROM "room_bindings" b JOIN "conversations" c ON c."id" = b."conversation_id"
        WHERE b."conversation_id" = p_conversation;
      IF v_policy = 'from-join' THEN RETURN v_next; END IF;
      RETURN 1;
    END $$;

    CREATE OR REPLACE FUNCTION "messages_require_active_membership"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.kind = 'member' AND NOT EXISTS (SELECT 1 FROM conversation_memberships WHERE conversation_id = NEW.conversation_id AND member_id = NEW.sender_id AND left_at IS NULL) THEN
        -- Derived branch (Circles D3): bound rooms carry no roster rows;
        -- the shared audience function decides instead. Unbound
        -- conversations return no audience rows, so DM semantics are
        -- unchanged by construction.
        IF NOT EXISTS (SELECT 1 FROM room_audience(NEW.conversation_id, NEW.sender_id) WHERE can_write) THEN
          RAISE EXCEPTION 'active conversation membership required' USING ERRCODE = '42501';
        END IF;
      END IF;
      RETURN NEW;
    END; $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "messages_require_active_membership"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.kind = 'member' AND NOT EXISTS (SELECT 1 FROM conversation_memberships WHERE conversation_id = NEW.conversation_id AND member_id = NEW.sender_id AND left_at IS NULL) THEN
        RAISE EXCEPTION 'active conversation membership required' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END; $$;
    DROP FUNCTION IF EXISTS "room_history_floor"(uuid, uuid);
    DROP FUNCTION IF EXISTS "room_audience"(uuid, uuid);
    DROP TABLE IF EXISTS "room_recap_quotes";
    DROP TABLE IF EXISTS "room_recaps";
    DROP TABLE IF EXISTS "room_read_states";
    DROP TABLE IF EXISTS "room_event_attendees";
    DROP TABLE IF EXISTS "room_bindings";
    DROP TABLE IF EXISTS "group_audit_entries";
    DROP TABLE IF EXISTS "group_memberships";
    DROP TABLE IF EXISTS "groups";
  `)
}

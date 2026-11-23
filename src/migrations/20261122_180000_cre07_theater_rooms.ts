import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE room_bindings
      ADD COLUMN mode text NOT NULL DEFAULT 'chat' CHECK (mode IN ('chat','group','content-attached','theater')),
      ADD COLUMN access_policy text NOT NULL DEFAULT 'members' CHECK (access_policy IN ('public','members','paid','invite')),
      ADD COLUMN content_id uuid REFERENCES content(id) ON DELETE CASCADE,
      ADD COLUMN discussion_id uuid REFERENCES discussions(id) ON DELETE SET NULL,
      ADD COLUMN entitlement_resource text,
      ADD COLUMN entitlement_capability text,
      ADD COLUMN entitlement_scope text,
      ADD COLUMN participant_limit integer CHECK (participant_limit BETWEEN 1 AND 10000),
      ADD COLUMN starts_at timestamptz,
      ADD COLUMN ends_at timestamptz,
      ADD COLUMN pinned_message_id uuid REFERENCES messages(id) ON DELETE SET NULL;
    UPDATE room_bindings SET mode='group' WHERE group_id IS NOT NULL;
    ALTER TABLE messages ADD COLUMN room_removed_at timestamptz, ADD COLUMN room_removed_by uuid REFERENCES members(id) ON DELETE SET NULL,
      ADD COLUMN room_question boolean NOT NULL DEFAULT false;
    CREATE TABLE room_invitations (
      conversation_id uuid NOT NULL REFERENCES room_bindings(conversation_id) ON DELETE CASCADE,
      member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      PRIMARY KEY (conversation_id, member_id)
    );
    CREATE TABLE room_participation (
      conversation_id uuid NOT NULL REFERENCES room_bindings(conversation_id) ON DELETE CASCADE,
      member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      active_until timestamptz NOT NULL,
      PRIMARY KEY (conversation_id, member_id)
    );
    CREATE TABLE room_speaker_requests (
      conversation_id uuid NOT NULL REFERENCES room_bindings(conversation_id) ON DELETE CASCADE,
      member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      requested_at timestamptz NOT NULL DEFAULT now(),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
      PRIMARY KEY (conversation_id, member_id)
    );
    CREATE INDEX podcast_episodes_live_room_id_idx ON podcast_episodes (lower(live_room->>'roomId'));

    ALTER FUNCTION room_audience(uuid, uuid) RENAME TO room_community_audience;

    CREATE FUNCTION room_has_entitlement(p_site uuid, p_member uuid, p_resource text, p_capability text, p_scope text)
    RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (
        SELECT 1 FROM entitlements e JOIN supporters s ON s.id=e.supporter_id
        JOIN members m ON m.id=s.member_id
        WHERE e.site_id=p_site AND s.member_id=p_member AND m.status='active'
          AND e.resource=p_resource AND e.capability=p_capability
          AND e.scope IS NOT DISTINCT FROM p_scope AND e."limit" IS NULL
          AND e.starts_at <= now() AND (e.ends_at IS NULL OR e.ends_at > now()) AND e.revoked_at IS NULL
      )
    $$;

    CREATE FUNCTION room_audience(p_conversation uuid, p_member uuid)
    RETURNS TABLE (can_read boolean, can_write boolean, audience_role text)
    LANGUAGE plpgsql STABLE AS $$
    DECLARE
      b room_bindings%ROWTYPE;
      member_status text;
      standing boolean;
      base_read boolean;
      base_write boolean;
      base_role text;
    BEGIN
      SELECT rb.* INTO b FROM room_bindings rb JOIN conversations c ON c.id=rb.conversation_id
        WHERE rb.conversation_id=p_conversation AND rb.site_id=c.site_id;
      IF NOT FOUND THEN RETURN; END IF;
      SELECT status INTO member_status FROM members WHERE id=p_member;
      IF p_member IS NOT NULL AND (member_status IS NULL OR member_status NOT IN ('active','restricted')) THEN RETURN; END IF;
      standing := EXISTS (SELECT 1 FROM member_site_roles WHERE site_id=b.site_id AND member_id=p_member);

      IF b.group_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM groups WHERE id=b.group_id AND site_id=b.site_id AND status='active') THEN RETURN; END IF;
      END IF;
      IF b.group_id IS NOT NULL OR b.event_restricted OR b.access_policy='members' THEN
        SELECT a.can_read, a.can_write, a.audience_role INTO base_read, base_write, base_role
          FROM room_community_audience(p_conversation,p_member) a;
        IF base_read IS DISTINCT FROM true THEN RETURN; END IF;
      ELSE
        base_write := member_status='active' AND (standing OR b.access_policy IN ('paid','invite'));
        base_role := CASE WHEN p_member IS NULL OR NOT base_write THEN 'guest' ELSE 'member' END;
      END IF;
      IF b.access_policy='paid' AND NOT room_has_entitlement(b.site_id,p_member,b.entitlement_resource,b.entitlement_capability,b.entitlement_scope) THEN RETURN; END IF;
      IF b.access_policy='invite' AND NOT EXISTS (
        SELECT 1 FROM room_invitations WHERE conversation_id=p_conversation AND member_id=p_member
      ) THEN RETURN; END IF;
      IF b.content_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM content c WHERE c.id=b.content_id AND c.site_id=b.site_id
          AND c.status IN ('published','updated','scheduled')
          AND (c.status <> 'scheduled' OR c.published_at IS NOT NULL)
          AND (c.published_at IS NULL OR c.published_at <= now())
          AND (c.visibility IN ('public','unlisted') OR (c.visibility='members' AND standing))
          AND COALESCE(to_jsonb(c)->>'moderation_state','clear')='clear'
          AND to_jsonb(c)->>'suspended_at' IS NULL
          AND c.retention_mode NOT IN ('manual-burn','tombstone')
          AND (c.retention_mode <> 'expire-at' OR c.retention_expires_at > now())
          AND (c.required_entitlement IS NULL OR room_has_entitlement(b.site_id,p_member,
            c.required_entitlement->>'resource',c.required_entitlement->>'capability',c.required_entitlement->>'scope'))
      ) THEN RETURN; END IF;
      IF EXISTS (
        SELECT 1 FROM podcast_episodes e JOIN podcast_shows s ON s.id=e.show_id AND s.site_id=b.site_id
        WHERE e.site_id=b.site_id AND lower(e.live_room->>'roomId')=p_conversation::text
          AND (e.live_room->>'access'='members' OR e.members_only OR s.feed_visibility='members' OR s.required_entitlement IS NOT NULL)
          AND NOT room_has_entitlement(b.site_id,p_member,
            COALESCE(NULLIF(s.required_entitlement->>'resource',''),'podcast-show:' || s.id),
            COALESCE(NULLIF(s.required_entitlement->>'capability',''),'listen'),
            NULLIF(s.required_entitlement->>'scope',''))
      ) THEN RETURN; END IF;
      can_read := true;
      can_write := COALESCE(base_write,false) AND b.lifecycle='open'
        AND EXISTS (SELECT 1 FROM conversations WHERE id=p_conversation AND status='active')
        AND NOT EXISTS (
          SELECT 1 FROM member_sanctions WHERE site_id=b.site_id AND member_id=p_member
            AND revoked_at IS NULL AND starts_at<=now() AND (expires_at IS NULL OR expires_at>now())
            AND (scope='site_global' OR (scope='object' AND scope_id=p_conversation))
        );
      audience_role := base_role;
      RETURN NEXT;
    END $$;

    CREATE OR REPLACE FUNCTION messages_require_active_membership() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.kind <> 'member' THEN RETURN NEW; END IF;
      IF EXISTS (SELECT 1 FROM room_bindings WHERE conversation_id=NEW.conversation_id) THEN
        IF EXISTS (
          SELECT 1 FROM room_bindings b, room_audience(NEW.conversation_id,NEW.sender_id) a
          WHERE b.conversation_id=NEW.conversation_id AND a.can_write
            AND (b.participant_limit IS NULL OR EXISTS (
              SELECT 1 FROM room_participation WHERE conversation_id=NEW.conversation_id
                AND member_id=NEW.sender_id AND active_until>now()
            ))
        ) THEN RETURN NEW; END IF;
      ELSIF EXISTS (
        SELECT 1 FROM conversation_memberships WHERE conversation_id=NEW.conversation_id
          AND member_id=NEW.sender_id AND left_at IS NULL
      ) THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'active conversation membership required' USING ERRCODE='42501';
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP FUNCTION room_audience(uuid, uuid);
    ALTER FUNCTION room_community_audience(uuid, uuid) RENAME TO room_audience;
    CREATE OR REPLACE FUNCTION messages_require_active_membership() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.kind='member'
        AND NOT EXISTS (SELECT 1 FROM conversation_memberships WHERE conversation_id=NEW.conversation_id AND member_id=NEW.sender_id AND left_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM room_audience(NEW.conversation_id,NEW.sender_id) WHERE can_write) THEN
        RAISE EXCEPTION 'active conversation membership required' USING ERRCODE='42501';
      END IF;
      RETURN NEW;
    END $$;
    DROP FUNCTION room_has_entitlement(uuid, uuid, text, text, text);
    DROP INDEX podcast_episodes_live_room_id_idx;
    DROP TABLE room_speaker_requests, room_participation, room_invitations;
    ALTER TABLE messages DROP COLUMN room_removed_at, DROP COLUMN room_removed_by, DROP COLUMN room_question;
    ALTER TABLE room_bindings DROP COLUMN mode, DROP COLUMN access_policy, DROP COLUMN content_id,
      DROP COLUMN discussion_id, DROP COLUMN entitlement_resource, DROP COLUMN entitlement_capability,
      DROP COLUMN entitlement_scope, DROP COLUMN participant_limit, DROP COLUMN starts_at, DROP COLUMN ends_at,
      DROP COLUMN pinned_message_id;
  `)
}
